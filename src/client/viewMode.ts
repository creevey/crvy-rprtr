import { ImagesViewModeSchema, safeParse } from '../schemas'
import type { ImagesViewMode } from '../schemas'

export const VIEW_MODE_KEY = 'Creevey_view_mode'

export const viewModes: ImagesViewMode[] = ['side-by-side', 'swap', 'slide', 'blend']

export function getViewMode(): ImagesViewMode {
  const item = localStorage.getItem(VIEW_MODE_KEY)
  const parsed = safeParse(ImagesViewModeSchema, item)
  if (parsed !== null) {
    return parsed
  }
  return 'side-by-side'
}
