export function replaceIllegalFileNameCharactersInString(text: string) {
  return text.replace(/[\\,#%&{}/|*<>$":@.?]/g, '').replace(/\s+/g, ' ');
}

export function truncate(text: string, length: number) {
  return text.substring(0, length);
}
