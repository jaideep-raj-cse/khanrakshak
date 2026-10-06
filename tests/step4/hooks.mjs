// Resolve the project's extensionless relative imports (Vite allows them, Node doesn't).
export async function resolve(specifier, context, next) {
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && !/\.[cm]?[jt]sx?$|\.json$/.test(specifier)) {
    try { return await next(specifier + '.js', context); } catch { /* fall through */ }
  }
  return next(specifier, context);
}
