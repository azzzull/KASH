-- Guest participants do not have a KASH user_id until an account link is accepted.
-- Their authoritative allocation is identified by member_id during that interval.
alter table public.shared_savings_member_allocations
  alter column user_id drop not null;

-- Reconcile any existing member-based allocations whose participant has since
-- linked a KASH account. This is identity attribution only; amounts are unchanged.
update public.shared_savings_member_allocations allocation
set user_id = member.user_id
from public.shared_savings_members member
where allocation.member_id = member.id
  and allocation.user_id is null
  and member.user_id is not null;

-- Preserve the original participant and its historical allocation when a Guest
-- accepts a KASH account link, while making that share available to account-level
-- read models that still key by user_id.
create or replace function public.respond_shared_savings_guest_account_link(p_request_id uuid,p_action text) returns boolean
language plpgsql security definer set search_path=public as $$
declare v_actor uuid:=auth.uid(); v_request public.shared_savings_member_link_requests; v_member public.shared_savings_members; v_message text;
begin
 if v_actor is null then raise exception 'Authentication required.'; end if;
 select * into v_request from public.shared_savings_member_link_requests where id=p_request_id for update;
 if v_request.id is null or v_request.target_user_id<>v_actor then raise exception 'Link request not found.'; end if;
 if v_request.status<>'pending' then return v_request.status='accepted'; end if;
 if v_request.expires_at<now() then update public.shared_savings_member_link_requests set status='expired',responded_at=now() where id=v_request.id; return false; end if;
 if p_action='decline' then
  update public.shared_savings_member_link_requests set status='declined',responded_at=now() where id=v_request.id;
  v_message:='declined';
 elsif p_action='accept' then
  select * into v_member from public.shared_savings_members where id=v_request.participant_id for update;
  if v_member.member_type<>'guest' or v_member.status<>'active' then raise exception 'Guest participant is no longer eligible.'; end if;
  if exists(select 1 from public.shared_savings_members where shared_savings_id=v_member.shared_savings_id and user_id=v_actor and id<>v_member.id) then raise exception 'This KASH account already belongs to this Shared Savings.'; end if;
  update public.shared_savings_members set user_id=v_actor,member_type='kash_member' where id=v_member.id;
  update public.shared_savings_member_allocations set user_id=v_actor where member_id=v_member.id and user_id is null;
  update public.shared_savings_member_link_requests set status='accepted',responded_at=now() where id=v_request.id;
  v_message:='accepted';
 else raise exception 'Use accept or decline.'; end if;
 begin
  insert into public.notifications(user_id,type,title,message,entity_type,entity_id,metadata)
  values(v_request.requested_by_user_id,'shared_member_link_response','Shared Savings account link',coalesce(v_member.display_name,'Guest member') || ' ' || v_message || ' the account link request.','shared_savings_member_link_request',v_request.id,jsonb_build_object('request_id',v_request.id));
 exception when others then null;
 end;
 return p_action='accept';
end; $$;
grant execute on function public.respond_shared_savings_guest_account_link(uuid,text) to authenticated;
