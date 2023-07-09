export function replaceIllegalFileNameCharactersInString(text: string) {
  return text.replace(/[\\,#%&{}/*<>$":@.?]/g, '').replace(/\s+/g, ' ');
}
