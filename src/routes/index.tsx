import { createFileRoute } from "@tanstack/react-router";
import { CalendarDays, LayoutDashboard, LogIn, PlusCircle, Star } from "lucide-react";
import { Link } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { getDefaultRouteByRole } from "@/lib/routeUtils";
import { PublicEventCalendar } from "@/components/home/PublicEventCalendar";
import ffiLogo from "@/assets/ffi-logo.png";

function PublicHomePage() {
  const { user, role, isAdmin } = useAuth();
  const dashboardPath = user && role ? getDefaultRouteByRole(role, isAdmin()) : "/login";

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Public Top Bar */}
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur-sm">
        <div className="container flex h-16 items-center justify-between gap-3">
          <Link to="/" className="flex items-center gap-2.5 min-w-0">
            <img
              src={ffiLogo}
              alt="AFP Sulawesi Selatan"
              className="h-9 w-auto object-contain shrink-0"
            />
            <div className="min-w-0">
              <p className="font-bold text-sm sm:text-base text-foreground leading-tight truncate">
                AFP Sulawesi Selatan
              </p>
              <p className="text-[11px] text-muted-foreground leading-tight truncate">
                Kalender Event &amp; Penugasan Wasit
              </p>
            </div>
          </Link>

          <nav className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <Link to="/review">
                <Star className="h-4 w-4 mr-1.5" />
                Penilaian Wasit
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="hidden md:inline-flex">
              <Link to="/events/submit">
                <PlusCircle className="h-4 w-4 mr-1.5" />
                Ajukan Event
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link to={dashboardPath}>
                {user ? (
                  <>
                    <LayoutDashboard className="h-4 w-4 mr-1.5" />
                    Dashboard
                  </>
                ) : (
                  <>
                    <LogIn className="h-4 w-4 mr-1.5" />
                    Masuk
                  </>
                )}
              </Link>
            </Button>
          </nav>
        </div>
      </header>

      {/* Hero Band */}
      <section className="gradient-primary text-primary-foreground">
        <div className="container py-8 sm:py-12">
          <div className="max-w-3xl space-y-3">
            <p className="text-xs sm:text-sm font-medium uppercase tracking-wider text-primary-foreground/80">
              Asosiasi Futsal Provinsi Sulawesi Selatan
            </p>
            <h1 className="text-2xl sm:text-4xl font-bold tracking-tight text-balance">
              Kalender Event Publik &amp; Cek Jadwal Kosong
            </h1>
            <p className="text-sm sm:text-base text-primary-foreground/90 max-w-2xl">
              Periksa jadwal event futsal resmi di 24 Kabupaten/Kota se-Sulawesi Selatan untuk
              menemukan tanggal yang masih kosong sebelum mengajukan rekomendasi penyelenggaraan
              event.
            </p>
            <div className="pt-2 flex flex-wrap gap-2.5">
              <Button asChild variant="secondary" size="sm" className="font-semibold">
                <a href="#kalender-publik">
                  <CalendarDays className="h-4 w-4 mr-1.5" />
                  Lihat Kalender Event
                </a>
              </Button>
              <Button
                asChild
                variant="outline"
                size="sm"
                className="bg-transparent border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
              >
                <Link to="/events/submit">
                  <PlusCircle className="h-4 w-4 mr-1.5" />
                  Ajukan Event Baru
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Public Event Calendar Section */}
      <main id="kalender-publik" className="flex-1 container py-6 sm:py-8">
        <PublicEventCalendar />
      </main>

      {/* Footer */}
      <footer className="border-t bg-card py-6">
        <div className="container flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
          <p className="text-xs text-muted-foreground">
            © 2026 Asosiasi Futsal Provinsi Sulawesi Selatan — Sistem Manajemen Wasit &amp; Event
          </p>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <Link to="/review" className="hover:text-foreground transition-colors">
              Penilaian Wasit
            </Link>
            <Link to="/signup" className="hover:text-foreground transition-colors">
              Daftar Panitia
            </Link>
            <Link to="/login" className="hover:text-foreground transition-colors">
              Masuk
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Kalender Event Publik — AFP Sulawesi Selatan" },
      {
        name: "description",
        content:
          "Lihat kalender event futsal resmi dan cek ketersediaan jadwal kosong per kabupaten/kota di Sulawesi Selatan.",
      },
      { property: "og:title", content: "Kalender Event Publik — AFP Sulawesi Selatan" },
      {
        property: "og:description",
        content:
          "Lihat kalender event futsal resmi dan cek ketersediaan jadwal kosong per kabupaten/kota di Sulawesi Selatan.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PublicHomePage,
});
