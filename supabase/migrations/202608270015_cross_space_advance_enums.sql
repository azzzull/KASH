-- 202608270015_cross_space_advance_enums.sql
-- Add personal_advance_to_managed event type
ALTER TYPE public.cross_space_event_type ADD VALUE 'personal_advance_to_managed';

-- Add managed_advance_cash_in tx role
ALTER TYPE public.cross_space_tx_role ADD VALUE 'managed_advance_cash_in';
