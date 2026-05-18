import growthPlaybooks from '@/playbooks/growth_playbooks.json';

type GrowthPlaybooksConfig = typeof growthPlaybooks;

export type StagePlaybook = GrowthPlaybooksConfig['stagePlaybooks'][number];
export type PersonaOverlay = GrowthPlaybooksConfig['personaOverlays'][number];

export const playbookConfig = growthPlaybooks;
export const stagePlaybooks = growthPlaybooks.stagePlaybooks;
export const personaOverlays = growthPlaybooks.personaOverlays;
