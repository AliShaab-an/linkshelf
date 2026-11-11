export const LIST_PAGE_SIZE = 25;

export function listRange(length: number, requestedPage: number) {
  const pages = Math.max(1, Math.ceil(length / LIST_PAGE_SIZE));
  const page = Math.min(Math.max(0, requestedPage), pages - 1);
  const start = page * LIST_PAGE_SIZE;
  return { page, pages, start, end: Math.min(start + LIST_PAGE_SIZE, length) };
}
