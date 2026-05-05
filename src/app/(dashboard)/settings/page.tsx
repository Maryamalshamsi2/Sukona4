import SettingsView, { type Profile, type SalonSettings } from "./settings-view";
import { getProfile, getSalon } from "./actions";

export default async function SettingsPage() {
  const [profile, salon] = await Promise.all([getProfile(), getSalon()]);
  return (
    <SettingsView
      initialProfile={(profile ?? null) as Profile | null}
      initialSalon={(salon ?? null) as SalonSettings | null}
    />
  );
}
