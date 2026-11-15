import { createFileRoute } from "@tanstack/react-router";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { useState, useEffect } from "react";
import { Plus, Search, Filter, Star, ChevronRight, X, MapPin, Loader2, Download } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetFooter,
} from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useReferees, useRefereesCount, useRefereeStats, LICENSE_LEVELS, getLicenseBadgeColor, exportRefereesToCSV } from "@/hooks/useReferees";
import { useKabupatenKotaList } from "@/hooks/useOrganization";
import { formatLicenseLevel } from "@/lib/formatters";
import { toast } from "sonner";

function Referees() {
  const navigate = useNavigate();
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;
  const [searchQuery, setSearchQuery] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState({
    kabKota: "",
    license: "",
    status: "",
     expiringLicense: "",
  });
  const [tempFilters, setTempFilters] = useState(filters);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filters.kabKota, filters.license, filters.status]);

  // Build query filters
  const queryFilters = {
    search: searchQuery || undefined,
    kabupatenKotaId: filters.kabKota || undefined,
    licenseLevel: filters.license || undefined,
    isActive: filters.status === "active" ? true : filters.status === "inactive" ? false : undefined,
     expiringInDays: filters.expiringLicense ? 30 : undefined,
    page: currentPage,
    pageSize,
  };

  const { data: referees, isLoading } = useReferees(queryFilters);
  const { data: totalCount } = useRefereesCount({
    search: searchQuery || undefined,
    kabupatenKotaId: filters.kabKota || undefined,
    licenseLevel: filters.license || undefined,
    isActive: filters.status === "active" ? true : filters.status === "inactive" ? false : undefined,
     expiringInDays: filters.expiringLicense ? 30 : undefined,
  });
  const { data: stats } = useRefereeStats();
  const { data: kabupatenKotaList } = useKabupatenKotaList();

  const totalPages = Math.ceil((totalCount || 0) / pageSize);
  const activeFilterCount = Object.values(filters).filter((v) => v !== "").length;

  const handleApplyFilters = () => {
    setFilters(tempFilters);
    setFilterOpen(false);
  };

  const handleResetFilters = () => {
     const resetFilters = { kabKota: "", license: "", status: "", expiringLicense: "" };
    setTempFilters(resetFilters);
    setFilters(resetFilters);
  };

  const removeFilter = (key: keyof typeof filters) => {
    setFilters((prev) => ({ ...prev, [key]: "" }));
    setTempFilters((prev) => ({ ...prev, [key]: "" }));
  };

  const handleExportCSV = () => {
    if (!referees || referees.length === 0) {
      toast.error("Tidak ada data untuk di-export");
      return;
    }

    const timestamp = new Date().toISOString().split("T")[0];
    let filename = `referees-export-${timestamp}`;
    
    if (filters.license) {
      filename += `-${filters.license}`;
    }
    if (filters.kabKota) {
      const kabName = kabupatenKotaList?.find(k => k.id === filters.kabKota)?.name;
      if (kabName) {
        filename += `-${kabName.replace(/\s+/g, "-").toLowerCase()}`;
      }
    }
    filename += ".csv";

    exportRefereesToCSV(referees, filename);
    toast.success(`${referees.length} wasit berhasil di-export`);
  };

  return (
    <AppLayout title="Database Wasit">
      <div className="p-4 space-y-4 animate-fade-in">
        {/* Stats Summary */}
        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold text-primary">{stats?.total || 0}</p>
              <p className="text-xs text-muted-foreground">Total Wasit</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold text-success">{stats?.active || 0}</p>
              <p className="text-xs text-muted-foreground">Aktif</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold text-muted-foreground">{stats?.inactive || 0}</p>
              <p className="text-xs text-muted-foreground">Non-Aktif</p>
            </CardContent>
          </Card>
        </div>

        {/* Search and Filter */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cari wasit..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button 
            variant="outline" 
            size="icon"
            onClick={handleExportCSV}
            disabled={!referees || referees.length === 0}
            title="Export CSV"
          >
            <Download className="h-4 w-4" />
          </Button>
          <Sheet open={filterOpen} onOpenChange={setFilterOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className="relative">
                <Filter className="h-4 w-4" />
                {activeFilterCount > 0 && (
                  <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary text-[10px] font-medium text-primary-foreground flex items-center justify-center">
                    {activeFilterCount}
                  </span>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="h-auto max-h-[80vh]">
              <SheetHeader>
                <SheetTitle>Filter Wasit</SheetTitle>
                <SheetDescription>Pilih kriteria untuk memfilter daftar wasit</SheetDescription>
              </SheetHeader>
              <div className="py-6 space-y-4">
                <div className="space-y-2">
                  <Label>Kab/Kota</Label>
                  <Select
                    value={tempFilters.kabKota}
                    onValueChange={(value) => setTempFilters((prev) => ({ ...prev, kabKota: value === "all" ? "" : value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Semua Kab/Kota" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Semua Kab/Kota</SelectItem>
                      {kabupatenKotaList?.map((kk) => (
                        <SelectItem key={kk.id} value={kk.id}>{kk.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Lisensi</Label>
                  <Select
                    value={tempFilters.license}
                    onValueChange={(value) => setTempFilters((prev) => ({ ...prev, license: value === "all" ? "" : value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Semua Lisensi" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Semua Lisensi</SelectItem>
                      {LICENSE_LEVELS.map((level) => (
                        <SelectItem key={level.value} value={level.value}>{level.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select
                    value={tempFilters.status}
                    onValueChange={(value) => setTempFilters((prev) => ({ ...prev, status: value === "all" ? "" : value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Semua Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Semua Status</SelectItem>
                      <SelectItem value="active">Aktif</SelectItem>
                      <SelectItem value="inactive">Non-Aktif</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                   <Label>Lisensi Hampir Habis</Label>
                   <Select
                     value={tempFilters.expiringLicense}
                     onValueChange={(value) => setTempFilters((prev) => ({ ...prev, expiringLicense: value === "all" ? "" : value }))}
                   >
                     <SelectTrigger>
                       <SelectValue placeholder="Tidak" />
                     </SelectTrigger>
                     <SelectContent>
                       <SelectItem value="all">Tidak</SelectItem>
                        <SelectItem value="expiring">Ya (&lt; 30 hari)</SelectItem>
                     </SelectContent>
                   </Select>
                 </div>
              </div>
              <SheetFooter className="flex-row gap-2">
                <Button variant="outline" className="flex-1" onClick={handleResetFilters}>
                  Reset
                </Button>
                <Button className="flex-1" onClick={handleApplyFilters}>
                  Terapkan Filter
                </Button>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        </div>

        {/* Active Filter Chips */}
        {activeFilterCount > 0 && (
          <div className="flex flex-wrap gap-2">
            {filters.kabKota && (
              <Badge variant="secondary" className="gap-1 pr-1">
                <MapPin className="h-3 w-3" />
                {kabupatenKotaList?.find(k => k.id === filters.kabKota)?.name || filters.kabKota}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-4 w-4 ml-1 hover:bg-transparent"
                  onClick={() => removeFilter("kabKota")}
                >
                  <X className="h-3 w-3" />
                </Button>
              </Badge>
            )}
            {filters.license && (
              <Badge variant="secondary" className="gap-1 pr-1">
                {filters.license}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-4 w-4 ml-1 hover:bg-transparent"
                  onClick={() => removeFilter("license")}
                >
                  <X className="h-3 w-3" />
                </Button>
              </Badge>
            )}
            {filters.status && (
              <Badge variant="secondary" className="gap-1 pr-1">
                {filters.status === "active" ? "Aktif" : "Non-Aktif"}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-4 w-4 ml-1 hover:bg-transparent"
                  onClick={() => removeFilter("status")}
                >
                  <X className="h-3 w-3" />
                </Button>
              </Badge>
            )}
            {filters.expiringLicense && (
                <Badge variant="secondary" className="gap-1 pr-1">
                  Lisensi Hampir Habis
                 <Button
                   variant="ghost"
                   size="icon"
                   className="h-4 w-4 ml-1 hover:bg-transparent"
                   onClick={() => removeFilter("expiringLicense")}
                 >
                   <X className="h-3 w-3" />
                 </Button>
               </Badge>
             )}
          </div>
        )}

        {/* Results Count */}
        <p className="text-sm text-muted-foreground">
          Menampilkan {((currentPage - 1) * pageSize) + 1}-{Math.min(currentPage * pageSize, totalCount || 0)} dari {totalCount || 0} wasit
        </p>

        {/* Referee Grid/List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : referees && referees.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {referees.map((referee) => (
              <Link key={referee.id} to={`/referees/${referee.id}`}>
                <Card className="hover:shadow-md transition-shadow h-full">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <Avatar className="h-14 w-14">
                        <AvatarImage src={referee.profile_photo_url || ""} />
                        <AvatarFallback className="bg-primary/10 text-primary font-semibold text-lg">
                          {referee.full_name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")
                            .slice(0, 2)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="font-semibold">{referee.full_name}</h3>
                            {referee.license_level && (
                              <Badge variant="outline" className={`text-xs ${getLicenseBadgeColor(referee.license_level)}`}>
                                {formatLicenseLevel(referee.license_level)}
                              </Badge>
                            )}
                          </div>
                          <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                        </div>
                        {referee.kabupaten_kota_name && (
                          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                            <MapPin className="h-3 w-3" />
                            {referee.kabupaten_kota_name}
                          </div>
                        )}
                        {referee.afk_origin && (
                          <p className="text-xs text-muted-foreground mt-1">
                            AFK: {referee.afk_origin}
                          </p>
                        )}
                        <div className="mt-2">
                          <StatusBadge status={referee.is_active ? "success" : "neutral"}>
                            {referee.is_active ? "Aktif" : "Non-Aktif"}
                          </StatusBadge>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-muted-foreground">
                {searchQuery || activeFilterCount > 0 
                  ? "Tidak ada wasit yang ditemukan" 
                  : "Belum ada data wasit"}
              </p>
              {(searchQuery || activeFilterCount > 0) && (
                <Button variant="link" onClick={handleResetFilters}>
                  Reset filter
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious 
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                />
              </PaginationItem>
              
              {[...Array(Math.min(5, totalPages))].map((_, i) => {
                let pageNum;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }
                
                return (
                  <PaginationItem key={pageNum}>
                    <PaginationLink
                      onClick={() => setCurrentPage(pageNum)}
                      isActive={currentPage === pageNum}
                      className="cursor-pointer"
                    >
                      {pageNum}
                    </PaginationLink>
                  </PaginationItem>
                );
              })}
              
              {totalPages > 5 && currentPage < totalPages - 2 && (
                <PaginationItem>
                  <PaginationEllipsis />
                </PaginationItem>
              )}
              
              <PaginationItem>
                <PaginationNext 
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        )}

        {/* FAB */}
        <Button
          size="lg"
          className="fixed bottom-24 right-4 md:bottom-8 rounded-full shadow-lg h-14 w-14 p-0"
          onClick={() => navigate("/users")}
        >
          <Plus className="h-6 w-6" />
        </Button>
      </div>
    </AppLayout>
  );
}

export const Route = createFileRoute("/referees/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Wasit \u2014 AFP Sulsel" },
      { name: "description", content: "Wasit \u2014 Sistem manajemen wasit Asosiasi Futsal Provinsi Sulawesi Selatan." },
      { property: "og:title", content: "Wasit \u2014 AFP Sulsel" },
      { property: "og:description", content: "Wasit \u2014 Sistem manajemen wasit Asosiasi Futsal Provinsi Sulawesi Selatan." },
    ],
  }),
  component: () => (
    <ProtectedRoute requireAdmin requireProfileComplete>
      <Referees />
    </ProtectedRoute>
  ),
});
