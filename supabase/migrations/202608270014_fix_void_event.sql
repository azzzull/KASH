-- Fix void_cross_space_event
create or replace function public.void_cross_space_event(p_event_id uuid)
returns void as $$
declare
  v_user_id uuid := auth.uid();
begin
  if not exists (select 1 from public.cross_space_events where id = p_event_id and user_id = v_user_id) then
    raise exception 'Event not found or unauthorized';
  end if;

  if exists (select 1 from public.cross_space_settlements where event_id = p_event_id and status != 'void') then
    raise exception 'Cannot void event with active settlements';
  end if;

  update public.transactions set status = 'void', updated_at = now() where cross_space_event_id = p_event_id;
  update public.debts set status = 'cancelled', updated_at = now() where cross_space_event_id = p_event_id;
  update public.cross_space_events set status = 'void', updated_at = now() where id = p_event_id;
end;
$$ language plpgsql security definer;
