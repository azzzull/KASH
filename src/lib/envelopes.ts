import type { Envelope, MoneyAmount } from "../types/domain";
import { formatMoneyDigits, parseMoneyInputDigits, toNumber } from "./money";
import { supabase } from "./supabase";

export type CreateEnvelopeInput = {
  name: string;
  icon?: string | null;
  color?: string | null;
  targetAmount?: string | null;
  note?: string | null;
};

export type UpdateEnvelopeInput = {
  name: string;
  icon?: string | null;
  color?: string | null;
  targetAmount?: string | null;
  note?: string | null;
  isArchived?: boolean;
};

export async function getEnvelopes(includeArchived = false): Promise<{ data: Envelope[] | null; error: Error | null }> {
  try {
    let query = supabase
      .from("envelopes")
      .select("*")
      .order("name", { ascending: true });

    if (!includeArchived) {
      query = query.eq("is_archived", false);
    }

    const { data, error } = await query;
    if (error) throw error;

    return { data: (data ?? []) as Envelope[], error: null };
  } catch (err: any) {
    return { data: null, error: err };
  }
}

export async function getEnvelopeById(id: string): Promise<{ data: Envelope | null; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from("envelopes")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw error;
    return { data: data as Envelope, error: null };
  } catch (err: any) {
    return { data: null, error: err };
  }
}

export async function createEnvelope(input: CreateEnvelopeInput): Promise<{ data: Envelope | null; error: Error | null }> {
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    const rawTarget = input.targetAmount ? parseMoneyInputDigits(input.targetAmount) : null;
    const numTarget = rawTarget ? toNumber(rawTarget) : null;

    const { data, error } = await supabase
      .from("envelopes")
      .insert({
        user_id: user.id,
        name: input.name.trim(),
        icon: input.icon ?? "layers",
        color: input.color ?? "#10B981",
        target_amount: numTarget && numTarget > 0 ? rawTarget : null,
        note: input.note?.trim() || null,
      })
      .select()
      .single();

    if (error) throw error;
    return { data: data as Envelope, error: null };
  } catch (err: any) {
    return { data: null, error: err };
  }
}

export async function updateEnvelope(id: string, input: UpdateEnvelopeInput): Promise<{ data: Envelope | null; error: Error | null }> {
  try {
    const rawTarget = input.targetAmount ? parseMoneyInputDigits(input.targetAmount) : null;
    const numTarget = rawTarget ? toNumber(rawTarget) : null;

    const { data, error } = await supabase
      .from("envelopes")
      .update({
        name: input.name.trim(),
        icon: input.icon,
        color: input.color,
        target_amount: numTarget && numTarget > 0 ? rawTarget : null,
        note: input.note?.trim() || null,
        is_archived: input.isArchived ?? false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return { data: data as Envelope, error: null };
  } catch (err: any) {
    return { data: null, error: err };
  }
}

export async function deleteEnvelope(id: string): Promise<{ success: boolean; error: Error | null }> {
  try {
    const { error } = await supabase.from("envelopes").delete().eq("id", id);
    if (error) throw error;
    return { success: true, error: null };
  } catch (err: any) {
    return { success: false, error: err };
  }
}
