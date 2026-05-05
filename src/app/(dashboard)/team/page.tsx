import TeamView from "./team-view";
import { getGroups, getTeamMembers } from "./actions";
import type { Profile, TeamGroup } from "@/types";

export default async function TeamPage() {
  const [groups, members] = await Promise.all([getGroups(), getTeamMembers()]);
  return (
    <TeamView
      initialMembers={(members || []) as Profile[]}
      initialGroups={(groups || []) as TeamGroup[]}
    />
  );
}
