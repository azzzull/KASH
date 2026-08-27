-- Fix NOT NULL constraint on wallet_id
ALTER TABLE public.transactions ALTER COLUMN wallet_id DROP NOT NULL;
