/** Public storage URL helpers — safe for server metadata and client components. */

function supabasePublicBase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return '';
  return url.replace(/\/$/, '');
}

export function publicPartImageUrl(storagePath: string) {
  return `${supabasePublicBase()}/storage/v1/object/public/part-images/${storagePath}`;
}

export function publicVehicleImageUrl(storagePath: string) {
  return `${supabasePublicBase()}/storage/v1/object/public/vehicle-images/${storagePath}`;
}
