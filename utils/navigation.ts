export type RouterLike = {
  back: () => void;
  replace: (href: any) => void;
  canGoBack?: () => boolean;
};

export function safeBack(router: RouterLike, fallbackRoute: any = '/(tabs)/home') {
  const canGoBack = router.canGoBack?.() ?? false;
  if (canGoBack) {
    router.back();
    return;
  }

  router.replace(fallbackRoute);
}
