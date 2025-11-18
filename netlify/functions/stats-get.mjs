import { readStats } from "./_stats-helpers.mjs";

export default async () => {
  const stats = await readStats();

  return new Response(JSON.stringify(stats), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};