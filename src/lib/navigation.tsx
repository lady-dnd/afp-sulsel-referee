/**
 * Small navigation helpers with the same call shapes the original app used
 * (string paths, navigate(-1), location.state, search params), backed by TanStack Router.
 */
import { forwardRef, useCallback, useEffect, useMemo, useRef, type AnchorHTMLAttributes } from "react";
import { Link as RouterLink, useRouter, useRouterState, useParams as useRouterParams } from "@tanstack/react-router";

type NavigateOptions = { replace?: boolean; state?: Record<string, unknown> };

export function useNavigate() {
  const router = useRouter();
  return useCallback(
    (to: string | number, options?: NavigateOptions) => {
      if (typeof to === "number") {
        router.history.go(to);
        return;
      }
      void router.navigate({
        href: to,
        replace: options?.replace,
        state: options?.state,
      } as never);
    },
    [router],
  );
}

export interface AppLocation {
  pathname: string;
  search: string;
  hash: string;
  state: unknown;
}

export function useLocation(): AppLocation {
  const location = useRouterState({ select: (s) => s.location });
  return useMemo(
    () => ({
      pathname: location.pathname,
      search: location.searchStr ?? "",
      hash: location.hash ? `#${location.hash}` : "",
      state: location.state,
    }),
    [location],
  );
}

export function useParams<T extends Record<string, string | undefined> = Record<string, string | undefined>>(): T {
  return useRouterParams({ strict: false } as never) as T;
}

export function useSearchParams(): [URLSearchParams, (next: URLSearchParams | Record<string, string>, opts?: NavigateOptions) => void] {
  const location = useLocation();
  const navigate = useNavigate();
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const setParams = useCallback(
    (next: URLSearchParams | Record<string, string>, opts?: NavigateOptions) => {
      const qs = (next instanceof URLSearchParams ? next : new URLSearchParams(next)).toString();
      navigate(`${location.pathname}${qs ? `?${qs}` : ""}`, { replace: opts?.replace ?? false });
    },
    [location.pathname, navigate],
  );
  return [params, setParams];
}

function splitHref(to: string) {
  const [pathAndSearch = "", hash] = to.split("#");
  const [pathname = "", search] = pathAndSearch.split("?");
  return {
    pathname,
    search: search ? Object.fromEntries(new URLSearchParams(search)) : undefined,
    hash,
  };
}

export interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  to: string;
  replace?: boolean;
  state?: Record<string, unknown>;
}

export const Link = forwardRef<HTMLAnchorElement, LinkProps>(({ to, replace, state, ...props }, ref) => {
  const { pathname, search, hash } = splitHref(to);
  return (
    <RouterLink
      ref={ref}
      {...(props as Record<string, unknown>)}
      to={pathname as never}
      search={search as never}
      hash={hash}
      replace={replace}
      state={state as never}
    />
  );
});
Link.displayName = "Link";

export interface NavLinkProps extends Omit<LinkProps, "className"> {
  end?: boolean;
  className?: string | ((args: { isActive: boolean; isPending: boolean }) => string | undefined);
}

export const NavLink = forwardRef<HTMLAnchorElement, NavLinkProps>(({ className, end, to, ...props }, ref) => {
  const { pathname } = useLocation();
  const target = splitHref(to).pathname;
  const isActive = end ? pathname === target : pathname === target || pathname.startsWith(`${target}/`);
  const resolved = typeof className === "function" ? className({ isActive, isPending: false }) : className;
  return <Link ref={ref} to={to} className={resolved} aria-current={isActive ? "page" : undefined} {...props} />;
});
NavLink.displayName = "NavLink";

export function Navigate({ to, replace, state }: { to: string; replace?: boolean; state?: Record<string, unknown> }) {
  const navigate = useNavigate();
  const lastTarget = useRef<string | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  useEffect(() => {
    // Redirect once per target; callers often pass a fresh state object every render.
    if (lastTarget.current === to) return;
    lastTarget.current = to;
    navigate(to, { replace, state: stateRef.current });
  }, [navigate, to, replace]);
  return null;
}
