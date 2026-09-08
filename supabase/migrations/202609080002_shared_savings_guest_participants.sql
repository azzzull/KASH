-- Shared Savings V2: a participant can be a KASH account holder or a guest.
-- Keep the existing member row as the stable participant identity.

alter table public.shared_savings_members alter column user_id drop not null;
alter table public.shared_savings_members
  add column if not exists member_type text not null default 'kash_member',
  add column if not exists display_name text,
  add column if not exists member_note text,
  add column if not exists phone text,
  add column if not exists email text;
alter table public.shared_savings_members add constraint shared_savings_member_type_valid check (member_type in ('kash_member','guest'));
update public.shared_savings_members m set display_name=coalesce(p.full_name,p.email), member_type='kash_member' from public.profiles p where p.id=m.user_id and m.display_name is null;

alter table public.shared_savings_member_allocations
  add column if not exists member_id uuid references public.shared_savings_members(id) on delete restrict;
update public.shared_savings_member_allocations a set member_id=m.id from public.shared_savings_members m where m.shared_savings_id=a.shared_savings_id and m.user_id=a.user_id and a.member_id is null;
create index if not exists shared_savings_allocations_member_idx on public.shared_savings_member_allocations(member_id);

alter table public.shared_savings_requests add column if not exists participant_id uuid references public.shared_savings_members(id) on delete restrict;
alter table public.shared_savings_requests drop constraint if exists shared_savings_contribution_source_valid;
alter table public.shared_savings_requests add constraint shared_savings_contribution_source_valid check (request_type <> 'contribution' or (contribution_date is not null and contribution_source_type in ('wallet_contribution','linked_historical_movement','already_received')));
update public.shared_savings_requests r set participant_id=m.id from public.shared_savings_members m where m.shared_savings_id=r.shared_savings_id and m.user_id=r.requested_by_user_id and r.participant_id is null;

-- PostgreSQL cannot reorder columns through CREATE OR REPLACE VIEW. This
-- migration is unapplied, so recreate the read model with participant fields.
drop view if exists public.shared_savings_member_shares_view;
create view public.shared_savings_member_shares_view with (security_invoker = true) as
select m.shared_savings_id,m.id as participant_id,m.user_id,m.member_type,m.display_name,m.member_note,m.phone,m.email,m.status as member_status,m.joined_at,m.left_at,
 coalesce(p.full_name,m.display_name) as member_name,coalesce(p.email,m.email) as member_email,p.avatar_url as member_avatar_url,
 coalesce(sum(a.amount_signed),0)::numeric(18,2) as current_share,
 coalesce(sum(case when a.amount_signed>0 then a.amount_signed else 0 end),0)::numeric(18,2) as total_contributed,
 coalesce(sum(case when a.amount_signed<0 and l.event_type='personal_withdrawal' then -a.amount_signed else 0 end),0)::numeric(18,2) as total_withdrawn,
 coalesce(sum(case when a.amount_signed<0 and l.event_type='shared_spending' then -a.amount_signed else 0 end),0)::numeric(18,2) as total_spent_allocated
from public.shared_savings_members m left join public.profiles p on p.id=m.user_id
left join public.shared_savings_member_allocations a on a.member_id=m.id or (a.member_id is null and a.shared_savings_id=m.shared_savings_id and a.user_id=m.user_id)
left join public.shared_savings_ledger l on l.id=a.ledger_id group by m.id,p.full_name,p.email,p.avatar_url;
grant select on public.shared_savings_member_shares_view to authenticated;

create or replace function public.create_shared_savings_guest_member(p_shared_savings_id uuid,p_name text,p_joined_at date default current_date,p_note text default null,p_phone text default null,p_email text default null) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_actor uuid:=auth.uid(); v_id uuid;
begin
 if v_actor is null then raise exception 'Authentication required.'; end if;
 if not exists(select 1 from public.shared_savings s where s.id=p_shared_savings_id and s.status='active' and (s.owner_user_id=v_actor or s.account_holder_user_id=v_actor)) then raise exception 'Only the Owner or Account Holder can add guest members.'; end if;
 if length(trim(coalesce(p_name,'')))=0 then raise exception 'Guest member name is required.'; end if;
 insert into public.shared_savings_members(shared_savings_id,user_id,member_type,display_name,member_note,phone,email,status,joined_at) values(p_shared_savings_id,null,'guest',trim(p_name),nullif(trim(p_note),''),nullif(trim(p_phone),''),nullif(lower(trim(p_email)),''),'active',coalesce(p_joined_at,current_date)) returning id into v_id;
 return v_id;
end; $$;
grant execute on function public.create_shared_savings_guest_member(uuid,text,date,text,text,text) to authenticated;

create or replace function public.record_shared_savings_payment_received(p_shared_savings_id uuid,p_participant_id uuid,p_amount numeric,p_contribution_date date,p_note text default null,p_client_request_id uuid default null) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_actor uuid:=auth.uid(); v_space public.shared_savings; v_member public.shared_savings_members; v_request uuid; v_ledger uuid:=gen_random_uuid(); v_existing boolean; v_total numeric;
begin
 if v_actor is null then raise exception 'Authentication required.'; end if;
 if p_amount is null or p_amount<=0 or p_contribution_date is null or p_contribution_date>current_date then raise exception 'Enter a valid positive amount and non-future contribution date.'; end if;
 select * into v_space from public.shared_savings where id=p_shared_savings_id;
 if v_space.id is null or v_space.status<>'active' or (v_space.owner_user_id<>v_actor and v_space.account_holder_user_id<>v_actor) then raise exception 'Only the Owner or Account Holder can record received payments.'; end if;
 select * into v_member from public.shared_savings_members where id=p_participant_id and shared_savings_id=p_shared_savings_id and status='active';
 if v_member.id is null then raise exception 'Choose an active participant.'; end if;
 insert into public.shared_savings_requests(shared_savings_id,request_type,requested_by_user_id,participant_id,amount,contribution_date,contribution_source_type,note,status,approved_by_user_id,approved_at,client_request_id)
 values(p_shared_savings_id,'contribution',v_actor,p_participant_id,p_amount,p_contribution_date,'already_received',p_note,'approved',v_actor,now(),p_client_request_id)
 on conflict (requested_by_user_id,client_request_id) where client_request_id is not null do update set updated_at=public.shared_savings_requests.updated_at returning id,(xmax=0) into v_request,v_existing;
 if not v_existing then return v_request; end if;
 insert into public.shared_savings_ledger(id,shared_savings_id,request_id,event_type,amount,title,note) values(v_ledger,p_shared_savings_id,v_request,'contribution',p_amount,'Payment Already Received',p_note);
 insert into public.shared_savings_member_allocations(shared_savings_id,ledger_id,member_id,user_id,amount_signed) values(p_shared_savings_id,v_ledger,v_member.id,v_member.user_id,p_amount);
 select sum(amount_signed) into v_total from public.shared_savings_member_allocations where ledger_id=v_ledger;
 if v_total<>p_amount then raise exception 'Financial invariant failed for received payment.'; end if;
 return v_request;
end; $$;
grant execute on function public.record_shared_savings_payment_received(uuid,uuid,numeric,date,text,uuid) to authenticated;

create or replace function public.link_shared_savings_guest_member(p_participant_id uuid,p_user_id uuid) returns boolean
language plpgsql security definer set search_path=public as $$
declare v_actor uuid:=auth.uid(); v_member public.shared_savings_members;
begin
 select * into v_member from public.shared_savings_members where id=p_participant_id for update;
 if v_actor is null or v_member.id is null or v_member.member_type<>'guest' then raise exception 'Guest participant not found.'; end if;
 if not exists(select 1 from public.shared_savings s where s.id=v_member.shared_savings_id and (s.owner_user_id=v_actor or s.account_holder_user_id=v_actor)) then raise exception 'Not authorized to link this guest.'; end if;
 if exists(select 1 from public.shared_savings_members where shared_savings_id=v_member.shared_savings_id and user_id=p_user_id and id<>v_member.id) then raise exception 'That KASH account already has a participant in this space.'; end if;
 update public.shared_savings_members set user_id=p_user_id,member_type='kash_member' where id=v_member.id;
 return true;
end; $$;
grant execute on function public.link_shared_savings_guest_member(uuid,uuid) to authenticated;
