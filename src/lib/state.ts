interface NotificationsState {
  hasAlreadyShownNoteAboutFlags: boolean
  hasAlreadyShownNoteAboutDuplicates: boolean
}

function createNotificationsState(): NotificationsState {
  return {
    hasAlreadyShownNoteAboutFlags: false,
    hasAlreadyShownNoteAboutDuplicates: false,
  }
}

export { createNotificationsState }
export type { NotificationsState }
