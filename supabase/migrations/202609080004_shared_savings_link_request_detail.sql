-- Target-scoped preview and completion notification for guest account links.
create or replace function public.get_shared_savings_guest_link_request(p_request_id uuid)
returns table(request_id uuid,status text,space_name text,member_name text,current_share numeric,joined_at timestamptz,requester_name text,expires_at timestamptz)
language sql security definer set search_path=public stable as $$
 select r.id,r.status,s.name,coalesce(m.display_name,p.full_name,p.email),coalesce(sum(a.amount_signed),0)::numeric,m.joined_at,coalesce(requester.full_name,requester.email),r.expires_at
 from public.shared_savings_member_link_requests r join public.shared_savings s on s.id=r.shared_savings_id join public.shared_savings_members m on m.id=r.participant_id
 left join public.profiles p on p.id=m.user_id left join public.profiles requester on requester.id=r.requested_by_user_id
 left join public.shared_savings_member_allocations a on a.member_id=m.id or (a.member_id is null and a.shared_savings_id=m.shared_savings_id and a.user_id=m.user_id)
 where r.id=p_request_id and r.target_user_id=auth.uid()
 group by r.id,s.name,m.id,p.full_name,p.email,requester.full_name,requester.email;
$$;
grant execute on function public.get_shared_savings_guest_link_request(uuid) to authenticated;

create or replace function public.respond_shared_savings_guest_account_link(p_request_id uuid,p_action text) returns boolean
language plpgsql security definer set search_path=public as $$
declare v_actor uuid:=auth.uid(); v_request public.shared_savings_member_link_requests; v_member public.shared_savings_members; v_message text;
begin
 if v_actor is null then raise exception 'Authentication required.'; end if;
 select * into v_request from public.shared_savings_member_link_requests where id=p_request_id for update;
 if v_request.id is null or v_request.target_user_id<>v_actor then raise exception 'Link request not found.'; end if;
 if v_request.status<>'pending' then return v_request.status='accepted'; end if;
 if v_request.expires_at<now() then update public.shared_savings_member_link_requests set status='expired',responded_at=now() where id=v_request.id; return false; end if;
 if p_action='decline' then update public.shared_savings_member_link_requests set status='declined',responded_at=now() where id=v_request.id; v_message:='declined';
 elsif p_action='accept' then
  select * into v_member from public.shared_savings_members where id=v_request.participant_id for update;
  if v_member.member_type<>'guest' or v_member.status<>'active' then raise exception 'Guest participant is no longer eligible.'; end if;
  if exists(select 1 from public.shared_savings_members where shared_savings_id=v_member.shared_savings_id and user_id=v_actor and id<>v_member.id) then raise exception 'This KASH account already belongs to this Shared Savings.'; end if;
  update public.shared_savings_members set user_id=v_actor,member_type='kash_member' where id=v_member.id;
  update public.shared_savings_member_link_requests set status='accepted',responded_at=now() where id=v_request.id; v_message:='accepted';
 else raise exception 'Use accept or decline.'; end if;
 begin insert into public.notifications(user_id,type,title,message,entity_type,entity_id,metadata) values(v_request.requested_by_user_id,'shared_member_link_response','Shared Savings account link',coalesce(v_member.display_name,'Guest member') || ' ' || v_message || ' the account link request.','shared_savings_member_link_request',v_request.id,jsonb_build_object('request_id',v_request.id)); exception when others then null; end;
 return p_action='accept';
end; $$;
grant execute on function public.respond_shared_savings_guest_account_link(uuid,text) to authenticated;
