import DayAllocationClient from "./day-allocation-client";

export const dynamic = "force-dynamic";

export default async function AllocateDayPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const initialDate = sp.date ?? new Date().toISOString().slice(0, 10);
  return <DayAllocationClient initialDate={initialDate} />;
}
