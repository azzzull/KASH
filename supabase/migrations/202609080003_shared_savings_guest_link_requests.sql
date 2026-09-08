-- Guest-to-account linking is an identity lifecycle, never a financial event.

alter table public.shared_savings_members drop constraint if exists shared_savings_members_user_id_fkey;
alter table public.shared_savings_members add constraint shared_savings_members_user_id_fkey foreign key (user_id) references public.profiles(id) on delete set null;
create unique index if not exists shared_savings_member_linked_user_uidx on public.shared_savings_members(shared_savings_id,user_id) where user_id is not null;

create table if not exists public.shared_savings_member_link_requests (
 id uuid primary key default gen_random_uuid(), participant_id uuid not null references public.shared_savings_members(id) on delete restrict,
 shared_savings_id uuid not null references public.shared_savings(id) on delete cascade,
 target_user_id uuid not null references public.profiles(id) on delete cascade,
 requested_by_user_id uuid not null references public.profiles(id) on delete restrict,
 status text not null default 'pending' check (status in ('pending','accepted','declined','cancelled','expired')),
 expires_at timestamptz not null default now()+interval '7 days', responded_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index if not exists shared_savings_member_link_pending_uidx on public.shared_savings_member_link_requests(participant_id) where status='pending';
create trigger shared_savings_member_link_requests_updated_at before update on public.shared_savings_member_link_requests for each row execute function public.set_updated_at();
alter table public.shared_savings_member_link_requests enable row level security;
create policy "Link request participants can view" on public.shared_savings_member_link_requests for select using (target_user_id=auth.uid() or requested_by_user_id=auth.uid());

-- Disable the previous direct mutation path: acceptance is mandatory.
revoke all on function public.link_shared_savings_guest_member(uuid,uuid) from authenticated;

create or replace function public.request_shared_savings_guest_account_link(p_participant_id uuid,p_target_email text) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_actor uuid:=auth.uid(); v_member public.shared_savings_members; v_target uuid; v_request uuid; v_name text;
begin
 if v_actor is null then raise exception 'Authentication required.'; end if;
 select * into v_member from public.shared_savings_members where id=p_participant_id for update;
 if v_member.id is null or v_member.member_type<>'guest' or v_member.status<>'active' then raise exception 'Active guest participant not found.'; end if;
 if not exists(select 1 from public.shared_savings s where s.id=v_member.shared_savings_id and s.owner_user_id=v_actor) then raise exception 'Only the Owner can request account linking.'; end if;
 select id into v_target from public.profiles where lower(email)=lower(trim(p_target_email));
 if v_target is null then raise exception 'No KASH account was found for that email.'; end if;
 if exists(select 1 from public.shared_savings_members where shared_savings_id=v_member.shared_savings_id and user_id=v_target) then raise exception 'This KASH account already belongs to this Shared Savings.'; end if;
 insert into public.shared_savings_member_link_requests(participant_id,shared_savings_id,target_user_id,requested_by_user_id)
 values(v_member.id,v_member.shared_savings_id,v_target,v_actor) on conflict (participant_id) where status='pending' do update set target_user_id=excluded.target_user_id,requested_by_user_id=excluded.requested_by_user_id,expires_at=now()+interval '7 days',updated_at=now() returning id into v_request;
 select coalesce(display_name,'Guest member') into v_name from public.shared_savings_members where id=v_member.id;
 insert into public.notifications(user_id,type,title,message,entity_type,entity_id,metadata) values(v_target,'shared_member_link_request','Link Shared Savings Account',v_name || ' is requesting to link you to an existing Shared Savings participant. No money will move.','shared_savings_member_link_request',v_request,jsonb_build_object('request_id',v_request,'shared_savings_id',v_member.shared_savings_id));
 return v_request;
end; $$;
grant execute on function public.request_shared_savings_guest_account_link(uuid,text) to authenticated;

create or replace function public.respond_shared_savings_guest_account_link(p_request_id uuid,p_action text) returns boolean
language plpgsql security definer set search_path=public as $$
declare v_actor uuid:=auth.uid(); v_request public.shared_savings_member_link_requests; v_member public.shared_savings_members;
begin
 if v_actor is null then raise exception 'Authentication required.'; end if;
 select * into v_request from public.shared_savings_member_link_requests where id=p_request_id for update;
 if v_request.id is null or v_request.target_user_id<>v_actor then raise exception 'Link request not found.'; end if;
 if v_request.status<>'pending' then return v_request.status='accepted'; end if;
 if v_request.expires_at<now() then update public.shared_savings_member_link_requests set status='expired',responded_at=now() where id=v_request.id; raise exception 'Link request has expired.'; end if;
 if p_action='decline' then update public.shared_savings_member_link_requests set status='declined',responded_at=now() where id=v_request.id; return true; end if;
 if p_action<>'accept' then raise exception 'Use accept or decline.'; end if;
 select * into v_member from public.shared_savings_members where id=v_request.participant_id for update;
 if v_member.member_type<>'guest' or v_member.status<>'active' then raise exception 'Guest participant is no longer eligible.'; end if;
 if exists(select 1 from public.shared_savings_members where shared_savings_id=v_member.shared_savings_id and user_id=v_actor and id<>v_member.id) then raise exception 'This KASH account already belongs to this Shared Savings.'; end if;
 update public.shared_savings_members set user_id=v_actor,member_type='kash_member' where id=v_member.id;
 update public.shared_savings_member_link_requests set status='accepted',responded_at=now() where id=v_request.id;
 return true;
end; $$;
grant execute on function public.respond_shared_savings_guest_account_link(uuid,text) to authenticated;
