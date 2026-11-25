// Apply an async project response only while its originating project is active.
// This keeps late network responses from replacing a different project in the UI.
export function replaceProjectIfCurrent(current, expectedProjectId, updatedProject) {
  return current?.id === expectedProjectId ? updatedProject : current;
}
