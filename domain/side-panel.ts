import { z } from 'zod';

export const SidePanelSectionSchema = z.enum([
  'park',
  'today',
  'projects',
  'search',
  'review',
  'archive',
  'settings',
]);

export type SidePanelSection = z.infer<typeof SidePanelSectionSchema>;

export const SidePanelNavigationIntentSchema = z.strictObject({
  section: SidePanelSectionSchema,
  focusTarget: z.enum(['search-query']).optional(),
  requestId: z.string().min(1),
});

export type SidePanelNavigationIntent = z.infer<
  typeof SidePanelNavigationIntentSchema
>;

export const SIDE_PANEL_INTENTS_KEY = 'linkshelfSidePanelIntents';
export const SIDE_PANEL_INTENTS_LOCK = 'linkshelf:side-panel-intents';

