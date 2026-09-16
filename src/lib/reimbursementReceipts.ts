import { supabase } from "./supabase";
import type { ReimbursementReceipt } from "../types/domain";

export type ReimbursementReceiptDetail = ReimbursementReceipt & {
  eventId: string;
  eventTitle: string;
  managedSpaceName: string;
  settlementSource: "managed_wallet" | "external_direct";
};

export async function getReimbursementReceipts(personalSpaceId: string): Promise<ReimbursementReceiptDetail[]> {
  const { data: receipts, error } = await supabase
    .from("reimbursement_receipts")
    .select("*")
    .eq("personal_space_id", personalSpaceId)
    .order("payment_date", { ascending: false });
  if (error) throw error;
  if (!receipts?.length) return [];

  const { data: settlements, error: settlementError } = await supabase
    .from("cross_space_settlements")
    .select("id,event_id,settlement_source")
    .in("id", receipts.map((receipt) => receipt.settlement_id));
  if (settlementError) throw settlementError;
  const eventsIds = [...new Set((settlements ?? []).map((settlement) => settlement.event_id))];
  const { data: events, error: eventError } = await supabase
    .from("cross_space_events")
    .select("id,title,managed_space_id")
    .in("id", eventsIds);
  if (eventError) throw eventError;
  const spaceIds = [...new Set((events ?? []).map((event) => event.managed_space_id))];
  const { data: spaces, error: spaceError } = await supabase
    .from("financial_spaces")
    .select("id,name")
    .in("id", spaceIds);
  if (spaceError) throw spaceError;

  const settlementById = new Map((settlements ?? []).map((settlement) => [settlement.id, settlement]));
  const eventById = new Map((events ?? []).map((event) => [event.id, event]));
  const spaceById = new Map((spaces ?? []).map((space) => [space.id, space]));
  return receipts.flatMap((receipt) => {
    const settlement = settlementById.get(receipt.settlement_id);
    const event = settlement ? eventById.get(settlement.event_id) : undefined;
    if (!settlement || !event) return [];
    return [{
      ...receipt,
      eventId: event.id,
      eventTitle: event.title ?? "Reimbursement",
      managedSpaceName: spaceById.get(event.managed_space_id)?.name ?? "Managed Space",
      settlementSource: settlement.settlement_source,
    }];
  });
}

export async function allocateReimbursementReceipt(input: {
  settlementId: string;
  destinationWalletId: string;
  clientRequestId: string;
}) {
  const { data, error } = await supabase.rpc("allocate_reimbursement_receipt", {
    p_settlement_id: input.settlementId,
    p_destination_wallet_id: input.destinationWalletId,
    p_client_request_id: input.clientRequestId,
  });
  if (error) throw error;
  return data;
}

export async function getManagedReimbursementHistory(eventId: string) {
  const { data, error } = await supabase.rpc("get_managed_reimbursement_history", {
    p_event_id: eventId,
  });
  if (error) throw error;
  return data;
}
