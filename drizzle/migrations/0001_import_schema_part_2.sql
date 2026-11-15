CREATE OR REPLACE FUNCTION public.get_referees(
  _license_level text DEFAULT NULL::text,
  _is_active boolean DEFAULT NULL::boolean,
  _kabupaten_kota_id uuid DEFAULT NULL::uuid,
  _search text DEFAULT NULL::text
)
RETURNS TABLE(
  id uuid,
  full_name text,
  birth_date date,
  kabupaten_kota_id uuid,
  kabupaten_kota_name text,
  license_level text,
  license_expiry date,
  profile_photo_url text,
  is_active boolean,
  is_profile_complete boolean,
  afk_origin text,
  created_at timestamp with time zone
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    p.id,
    p.full_name,
    p.birth_date,
    p.kabupaten_kota_id,
    kk.name as kabupaten_kota_name,
    p.license_level,
    p.license_expiry,
    p.profile_photo_url,
    p.is_active,
    p.is_profile_complete,
    p.afk_origin,
    p.created_at
  FROM public.profiles p
  INNER JOIN public.user_roles ur ON ur.user_id = p.id
  LEFT JOIN public.kabupaten_kota kk ON kk.id = p.kabupaten_kota_id
  WHERE ur.role = 'wasit'
    AND p.deleted_at IS NULL
    AND (
      is_admin_provinsi(auth.uid())
      OR p.kabupaten_kota_id = get_user_kabupaten_kota(auth.uid())
    )
    AND (_license_level IS NULL OR p.license_level = _license_level)
    AND (_is_active IS NULL OR p.is_active = _is_active)
    AND (_kabupaten_kota_id IS NULL OR p.kabupaten_kota_id = _kabupaten_kota_id)
    AND (_search IS NULL OR p.full_name ILIKE '%' || _search || '%')
  ORDER BY p.full_name
$$;
CREATE POLICY "Referees can update their own assignment status"
ON public.event_assignments
FOR UPDATE
USING (
  deleted_at IS NULL 
  AND auth.uid() = referee_id
  AND status IN ('pending', 'confirmed')
)
WITH CHECK (
  status IN ('confirmed', 'declined')
);
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public 
AS $$
BEGIN
  INSERT INTO public.profiles (
    id, 
    full_name, 
    kabupaten_kota_id,
    requested_role,
    registration_status,
    is_profile_complete,
    is_active
  )
  VALUES (
    new.id, 
    COALESCE(new.raw_user_meta_data->>'full_name', new.email),
    (new.raw_user_meta_data->>'kabupaten_kota_id')::uuid,
    new.raw_user_meta_data->>'requested_role',
    'pending',
    false,
    true
  );
  RETURN new;
END;
$$;
CREATE TABLE public.evaluation_criteria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  weight integer DEFAULT 1,
  is_active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id),
  referee_id uuid NOT NULL REFERENCES public.profiles(id),
  evaluator_id uuid NOT NULL REFERENCES public.profiles(id),
  total_score numeric(5,2),
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'reviewed')),
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  submitted_at timestamptz,
  UNIQUE(event_id, referee_id, evaluator_id)
);
CREATE TABLE public.evaluation_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id uuid NOT NULL REFERENCES public.evaluations(id) ON DELETE CASCADE,
  criteria_id uuid NOT NULL REFERENCES public.evaluation_criteria(id),
  score integer NOT NULL CHECK (score >= 1 AND score <= 10),
  notes text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(evaluation_id, criteria_id)
);
ALTER TABLE public.evaluation_criteria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Everyone can view active criteria"
  ON public.evaluation_criteria FOR SELECT
  USING (is_active = true);
CREATE POLICY "Admin can manage criteria"
  ON public.evaluation_criteria FOR ALL
  USING (is_admin(auth.uid()));
CREATE POLICY "Admins can view all evaluations"
  ON public.evaluations FOR SELECT
  USING (is_admin(auth.uid()));
CREATE POLICY "Evaluators can view their own evaluations"
  ON public.evaluations FOR SELECT
  USING (auth.uid() = evaluator_id);
CREATE POLICY "Referees can view their own evaluations"
  ON public.evaluations FOR SELECT
  USING (auth.uid() = referee_id AND status = 'submitted');
CREATE POLICY "Evaluators can create evaluations"
  ON public.evaluations FOR INSERT
  WITH CHECK (auth.uid() = evaluator_id);
CREATE POLICY "Evaluators can update their draft evaluations"
  ON public.evaluations FOR UPDATE
  USING (auth.uid() = evaluator_id AND status = 'draft');
CREATE POLICY "Admin can update all evaluations"
  ON public.evaluations FOR UPDATE
  USING (is_admin(auth.uid()));
CREATE POLICY "View scores for accessible evaluations"
  ON public.evaluation_scores FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.evaluations e 
      WHERE e.id = evaluation_id 
      AND (is_admin(auth.uid()) OR e.evaluator_id = auth.uid() OR (e.referee_id = auth.uid() AND e.status = 'submitted'))
    )
  );
CREATE POLICY "Evaluators can manage scores for their evaluations"
  ON public.evaluation_scores FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.evaluations e 
      WHERE e.id = evaluation_id 
      AND e.evaluator_id = auth.uid() 
      AND e.status = 'draft'
    )
  );
CREATE POLICY "Admin can manage all scores"
  ON public.evaluation_scores FOR ALL
  USING (is_admin(auth.uid()));
INSERT INTO public.evaluation_criteria (name, description, weight, sort_order) VALUES
  ('Pengetahuan Peraturan', 'Pemahaman dan penerapan peraturan futsal', 2, 1),
  ('Pengambilan Keputusan', 'Ketepatan dan kecepatan dalam mengambil keputusan', 2, 2),
  ('Penempatan Posisi', 'Posisi yang tepat untuk melihat permainan', 1, 3),
  ('Komunikasi', 'Komunikasi dengan pemain, official, dan wasit lain', 1, 4),
  ('Kontrol Permainan', 'Kemampuan mengendalikan jalannya pertandingan', 2, 5),
  ('Kebugaran Fisik', 'Stamina dan kelincahan selama pertandingan', 1, 6),
  ('Sikap Profesional', 'Penampilan, ketepatan waktu, dan profesionalisme', 1, 7);
CREATE TRIGGER update_evaluation_criteria_updated_at
  BEFORE UPDATE ON public.evaluation_criteria
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER update_evaluations_updated_at
  BEFORE UPDATE ON public.evaluations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE events 
  DROP CONSTRAINT IF EXISTS events_created_by_fkey;
ALTER TABLE events
  ADD CONSTRAINT events_created_by_fkey 
    FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE honors 
  DROP CONSTRAINT IF EXISTS honors_verified_by_fkey;
ALTER TABLE honors
  ADD CONSTRAINT honors_verified_by_fkey 
    FOREIGN KEY (verified_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE profiles 
  DROP CONSTRAINT IF EXISTS profiles_approved_by_fkey;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_approved_by_fkey 
    FOREIGN KEY (approved_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE audit_logs
  DROP CONSTRAINT IF EXISTS audit_logs_actor_id_fkey;
ALTER TABLE audit_logs
  ADD CONSTRAINT audit_logs_actor_id_fkey
    FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE evaluations 
  DROP CONSTRAINT IF EXISTS evaluations_referee_id_fkey;
ALTER TABLE evaluations
  ADD CONSTRAINT evaluations_referee_id_fkey 
    FOREIGN KEY (referee_id) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE evaluations 
  DROP CONSTRAINT IF EXISTS evaluations_evaluator_id_fkey;
ALTER TABLE evaluations
  ADD CONSTRAINT evaluations_evaluator_id_fkey 
    FOREIGN KEY (evaluator_id) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE evaluations 
  DROP CONSTRAINT IF EXISTS evaluations_event_id_fkey;
ALTER TABLE evaluations
  ADD CONSTRAINT evaluations_event_id_fkey 
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL;
CREATE TABLE public.learning_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  law_number INTEGER,
  content TEXT NOT NULL,
  video_url TEXT,
  pdf_url TEXT,
  difficulty_level TEXT DEFAULT 'basic',
  sort_order INTEGER DEFAULT 0,
  is_published BOOLEAN DEFAULT true,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE public.learning_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  material_id UUID REFERENCES public.learning_materials(id) ON DELETE CASCADE NOT NULL,
  is_completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, material_id)
);
CREATE TABLE public.discussion_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL,
  law_reference INTEGER,
  author_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL NOT NULL,
  is_pinned BOOLEAN DEFAULT false,
  is_locked BOOLEAN DEFAULT false,
  view_count INTEGER DEFAULT 0,
  reply_count INTEGER DEFAULT 0,
  last_reply_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE public.discussion_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID REFERENCES public.discussion_topics(id) ON DELETE CASCADE NOT NULL,
  parent_reply_id UUID REFERENCES public.discussion_replies(id) ON DELETE CASCADE,
  author_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL NOT NULL,
  content TEXT NOT NULL,
  is_solution BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.learning_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discussion_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discussion_replies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Everyone can view published materials"
ON public.learning_materials FOR SELECT
USING (is_published = true);
CREATE POLICY "Admin can manage all materials"
ON public.learning_materials FOR ALL
USING (is_admin(auth.uid()));
CREATE POLICY "Users can view their own progress"
ON public.learning_progress FOR SELECT
USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own progress"
ON public.learning_progress FOR INSERT
WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own progress"
ON public.learning_progress FOR UPDATE
USING (auth.uid() = user_id);
CREATE POLICY "Authenticated users can view topics"
ON public.discussion_topics FOR SELECT
USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can create topics"
ON public.discussion_topics FOR INSERT
WITH CHECK (auth.uid() = author_id);
CREATE POLICY "Authors can update their own topics"
ON public.discussion_topics FOR UPDATE
USING (auth.uid() = author_id OR is_admin(auth.uid()));
CREATE POLICY "Authors can delete their own topics"
ON public.discussion_topics FOR DELETE
USING (auth.uid() = author_id OR is_admin(auth.uid()));
CREATE POLICY "Authenticated users can view replies"
ON public.discussion_replies FOR SELECT
USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can create replies"
ON public.discussion_replies FOR INSERT
WITH CHECK (auth.uid() = author_id);
CREATE POLICY "Authors can update their own replies"
ON public.discussion_replies FOR UPDATE
USING (auth.uid() = author_id OR is_admin(auth.uid()));
CREATE POLICY "Authors can delete their own replies"
ON public.discussion_replies FOR DELETE
USING (auth.uid() = author_id OR is_admin(auth.uid()));
CREATE TRIGGER set_learning_materials_updated_at
BEFORE UPDATE ON public.learning_materials
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_discussion_topics_updated_at
BEFORE UPDATE ON public.discussion_topics
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_discussion_replies_updated_at
BEFORE UPDATE ON public.discussion_replies
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE OR REPLACE FUNCTION public.update_topic_reply_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.discussion_topics 
    SET reply_count = reply_count + 1,
        last_reply_at = NEW.created_at
    WHERE id = NEW.topic_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.discussion_topics 
    SET reply_count = GREATEST(0, reply_count - 1)
    WHERE id = OLD.topic_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
CREATE TRIGGER update_reply_count
AFTER INSERT OR DELETE ON public.discussion_replies
FOR EACH ROW EXECUTE FUNCTION public.update_topic_reply_count();
INSERT INTO public.learning_materials (title, description, category, law_number, content, difficulty_level, sort_order) VALUES
('Lapangan Permainan Futsal', 'Memahami dimensi dan marking lapangan futsal sesuai standar FIFA', 'law_1_pitch', 1, 
'# Law 1: Lapangan Permainan

## Dimensi Lapangan
Lapangan futsal harus berbentuk persegi panjang dengan dimensi:
- **Panjang**: 25-42 meter (internasional: 38-42 meter)
- **Lebar**: 16-25 meter (internasional: 20-25 meter)

## Garis Lapangan
- Semua garis harus memiliki lebar **8 cm**
- Garis yang lebih panjang disebut **garis samping (touchline)**
- Garis yang lebih pendek disebut **garis gawang (goal line)**

## Area Penalti
- Berbentuk seperempat lingkaran dengan radius **6 meter** dari tiang gawang
- Titik penalti berada **6 meter** dari titik tengah garis gawang
- Titik penalti kedua berada **10 meter** dari titik tengah garis gawang

## Gawang
- Lebar: **3 meter** (diukur dari dalam tiang ke tiang)
- Tinggi: **2 meter** (dari tanah ke mistar)
- Tiang dan mistar harus berwarna sama dan kontras dengan lapangan

## Zona Pergantian
- Panjang **5 meter** di depan bangku cadangan
- Terletak di samping lapangan, berlawanan dengan meja pencatat waktu
', 'basic', 1),

('Wasit dalam Pertandingan Futsal', 'Peran, wewenang, dan tanggung jawab wasit dalam futsal', 'law_5_referees', 5,
'# Law 5: Wasit

## Wewenang Wasit
Setiap pertandingan dikontrol oleh **dua wasit** dengan wewenang penuh untuk menegakkan Laws of the Game.

### Wasit Utama (First Referee)
- Berdiri di sisi kiri lapangan
- Bertanggung jawab atas keputusan akhir
- Mencatat semua pelanggaran terakumulasi

### Wasit Kedua (Second Referee)
- Berdiri di sisi kanan lapangan
- Membantu wasit utama dalam pengambilan keputusan
- Memiliki wewenang yang sama dengan wasit utama

## Tugas dan Tanggung Jawab

### Sebelum Pertandingan
- Memeriksa bola dan perlengkapan
- Memastikan lapangan sesuai standar
- Memeriksa perlengkapan pemain

### Selama Pertandingan
- Menegakkan Laws of the Game
- Mencatat waktu dan skor
- Menghentikan permainan jika terjadi pelanggaran
- Memberikan peringatan dan pengusiran

### Setelah Pertandingan
- Membuat laporan pertandingan
- Melaporkan insiden serius

## Sinyal Wasit
- Tendangan bebas langsung: tangan horizontal menunjuk arah
- Tendangan bebas tidak langsung: tangan ke atas sampai bola dimainkan
- Penalti: menunjuk titik penalti
- Accumulated foul ke-6+: tangan menunjuk titik penalti kedua
', 'basic', 5),

('Pelanggaran dalam Futsal', 'Jenis-jenis pelanggaran dan sanksinya', 'law_12_fouls', 12,
'# Law 12: Pelanggaran

## Tendangan Bebas Langsung
Diberikan jika pemain melakukan pelanggaran berikut dengan cara yang dianggap wasit ceroboh, sembrono, atau dengan kekuatan berlebihan:

1. **Menendang** atau mencoba menendang lawan
2. **Menjegal** atau mencoba menjegal lawan
3. **Melompat** ke arah lawan
4. **Menabrak** lawan
5. **Memukul** atau mencoba memukul lawan
6. **Mendorong** lawan
7. **Menahan** lawan
8. **Meludahi** lawan
9. **Melakukan tackle** dan mengenai lawan sebelum bola
10. **Menyentuh bola dengan tangan** (kecuali penjaga gawang di area penalti)

## Pelanggaran Terakumulasi
- 5 pelanggaran pertama: tendangan bebas dengan dinding
- **Pelanggaran ke-6 dan seterusnya**: tendangan bebas **TANPA DINDING** dari titik penalti kedua (10 meter)

## Tendangan Bebas Tidak Langsung
Diberikan jika:
- Penjaga gawang menyentuh bola dengan tangan setelah menerimanya kembali dari rekan setim
- Penjaga gawang menguasai bola lebih dari **4 detik**
- Offside (jika berlaku di kompetisi tertentu)
- Menghalangi lawan tanpa memainkan bola

## Kartu Kuning (Peringatan)
- Perilaku tidak sportif
- Menunda restart permainan
- Berulang kali melanggar aturan
- Masuk/keluar lapangan tanpa izin wasit

## Kartu Merah (Pengusiran)
- Pelanggaran serius
- Perilaku kasar
- Meludahi orang lain
- Mencegah gol dengan handball (selain penjaga gawang)
- Menerima kartu kuning kedua
', 'basic', 12),

('Tendangan Penalti Futsal', 'Prosedur dan aturan tendangan penalti', 'law_14_penalty', 14,
'# Law 14: Tendangan Penalti

## Kapan Diberikan
Tendangan penalti diberikan ketika pemain melakukan pelanggaran yang layak mendapat tendangan bebas langsung **di dalam area penalti sendiri**.

## Prosedur

### Posisi Bola
- Bola ditempatkan di **titik penalti** (6 meter dari garis gawang)

### Penendang
- Harus diidentifikasi dengan jelas
- Hanya boleh menendang bola **ke depan**

### Penjaga Gawang
- Harus berada di **garis gawang**
- Menghadap penendang
- Boleh bergerak ke samping tapi tidak ke depan sampai bola ditendang

### Pemain Lain
- Berada di belakang bola
- Di luar area penalti
- Minimal 5 meter dari bola

## Aturan Penting
- Jika gol: restart dengan kick-off
- Jika tidak gol dan bola keluar: goal clearance atau corner kick
- Jika bola memantul ke lapangan: permainan dilanjutkan
- **Penendang tidak boleh menyentuh bola dua kali** sebelum pemain lain menyentuhnya

## Pelanggaran Tendangan Penalti Kedua (10 meter)
Diberikan untuk pelanggaran terakumulasi ke-6 dan seterusnya:
- Tidak ada dinding
- Penendang harus menembak langsung ke gawang
- Jika bola memantul dari penjaga gawang, penendang **tidak boleh** menyentuh bola lagi
', 'intermediate', 14);
ALTER PUBLICATION supabase_realtime ADD TABLE public.discussion_topics;
ALTER PUBLICATION supabase_realtime ADD TABLE public.discussion_replies;
ALTER TABLE public.event_assignments 
ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES profiles(id);
CREATE INDEX IF NOT EXISTS idx_event_assignments_cancelled_by ON public.event_assignments(cancelled_by);
COMMENT ON COLUMN public.event_assignments.cancellation_reason IS 'Reason for cancellation when admin cancels a confirmed assignment';
COMMENT ON COLUMN public.event_assignments.cancelled_by IS 'User ID of admin who cancelled the assignment';
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
ALTER TABLE public.profiles 
  ALTER COLUMN registration_status SET DEFAULT 'pending';
ALTER TABLE public.event_assignments 
DROP CONSTRAINT IF EXISTS event_assignments_status_check;
ALTER TABLE public.event_assignments 
ADD CONSTRAINT event_assignments_status_check 
CHECK (status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'declined'::text, 'cancelled'::text, 'completed'::text]));
DROP POLICY IF EXISTS "Admins can manage assignments on approved events" ON public.event_assignments;
CREATE POLICY "Admins can manage assignments on approved events"
ON public.event_assignments
FOR ALL
USING (
  deleted_at IS NULL 
  AND is_admin(auth.uid())
)
WITH CHECK (
  is_admin(auth.uid())
);
DROP POLICY IF EXISTS "Referees can update their own assignment status" ON public.event_assignments;
CREATE POLICY "Referees can update their own assignment status"
ON public.event_assignments
FOR UPDATE
USING (
  referee_id = auth.uid() 
  AND deleted_at IS NULL
)
WITH CHECK (
  referee_id = auth.uid() 
  AND status = ANY (ARRAY['confirmed'::text, 'declined'::text])
);
DROP POLICY IF EXISTS "Admins can update events" ON public.events;
DROP POLICY IF EXISTS "Admins can delete events" ON public.events;
CREATE POLICY "Admins can update events" ON public.events
FOR UPDATE USING (
  deleted_at IS NULL AND (
    is_admin_provinsi(auth.uid()) 
    OR (has_role(auth.uid(), 'admin_kab_kota'::app_role) AND kabupaten_kota_id = get_user_kabupaten_kota(auth.uid()))
    OR (has_role(auth.uid(), 'panitia'::app_role) AND created_by = auth.uid())
  )
)
WITH CHECK (
  deleted_at IS NULL AND (
    is_admin_provinsi(auth.uid()) 
    OR (has_role(auth.uid(), 'admin_kab_kota'::app_role) AND kabupaten_kota_id = get_user_kabupaten_kota(auth.uid()))
    OR (has_role(auth.uid(), 'panitia'::app_role) AND created_by = auth.uid())
  )
);
CREATE POLICY "Admins can soft delete events" ON public.events
FOR UPDATE USING (
  deleted_at IS NULL AND is_admin_provinsi(auth.uid())
)
WITH CHECK (
  is_admin_provinsi(auth.uid())
);
ALTER TABLE public.events 
ADD COLUMN IF NOT EXISTS document_path TEXT;
COMMENT ON COLUMN public.events.document_path IS 'Path ke file surat permohonan di storage bucket documents';
CREATE POLICY "Authenticated users can upload documents"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'documents');
CREATE POLICY "Authenticated users can read documents"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'documents');
CREATE POLICY "Admins can delete documents"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'documents' AND (
  public.is_admin_provinsi(auth.uid()) 
  OR public.has_role(auth.uid(), 'admin_kab_kota'::public.app_role)
));
DROP POLICY IF EXISTS "Admins can update events" ON public.events;
DROP POLICY IF EXISTS "Admins can soft delete events" ON public.events;
DROP POLICY IF EXISTS "Admin provinsi can restore events" ON public.events;
CREATE POLICY "Admins can update events" ON public.events
FOR UPDATE USING (
  deleted_at IS NULL 
  AND (
    is_admin_provinsi(auth.uid()) 
    OR (has_role(auth.uid(), 'admin_kab_kota'::app_role) 
        AND kabupaten_kota_id = get_user_kabupaten_kota(auth.uid()))
    OR (has_role(auth.uid(), 'panitia'::app_role) 
        AND created_by = auth.uid() 
        AND status = 'DIAJUKAN')
  )
)
WITH CHECK (TRUE);
CREATE POLICY "Admin provinsi can restore events" ON public.events
FOR UPDATE USING (
  deleted_at IS NOT NULL 
  AND is_admin_provinsi(auth.uid())
)
WITH CHECK (
  is_admin_provinsi(auth.uid())
);
DROP POLICY IF EXISTS "Admin and panitia can create events" ON public.events;
CREATE POLICY "Admin and panitia can create events" 
ON public.events 
FOR INSERT 
TO authenticated
WITH CHECK (
  is_admin_provinsi(auth.uid()) 
  OR has_role(auth.uid(), 'admin_kab_kota'::app_role) 
  OR has_role(auth.uid(), 'panitia'::app_role)
);
DROP POLICY IF EXISTS "Everyone can view events" ON public.events;
CREATE POLICY "Authenticated users can view events"
ON public.events
FOR SELECT
TO authenticated
USING (deleted_at IS NULL);
DROP POLICY IF EXISTS "Admins can update events" ON public.events;
DROP POLICY IF EXISTS "Admin provinsi can restore events" ON public.events;
CREATE POLICY "Authorized users can update events"
ON public.events
FOR UPDATE
TO authenticated
USING (
  deleted_at IS NULL 
  AND (
    is_admin_provinsi(auth.uid()) 
    OR (has_role(auth.uid(), 'admin_kab_kota'::app_role) AND kabupaten_kota_id = get_user_kabupaten_kota(auth.uid()))
    OR (has_role(auth.uid(), 'panitia'::app_role) AND created_by = auth.uid() AND status = 'DIAJUKAN')
  )
)
WITH CHECK (
  is_admin_provinsi(auth.uid()) 
  OR (has_role(auth.uid(), 'admin_kab_kota'::app_role) AND kabupaten_kota_id = get_user_kabupaten_kota(auth.uid()))
  OR (has_role(auth.uid(), 'panitia'::app_role) AND created_by = auth.uid() AND status = 'DIAJUKAN')
);
CREATE POLICY "Admin provinsi can restore events"
ON public.events
FOR UPDATE
TO authenticated
USING (
  deleted_at IS NOT NULL 
  AND is_admin_provinsi(auth.uid())
)
WITH CHECK (is_admin_provinsi(auth.uid()));
DROP POLICY IF EXISTS "Authorized users can update events" ON public.events;
DROP POLICY IF EXISTS "Admin provinsi can restore events" ON public.events;
CREATE POLICY "Users can update event details"
ON public.events
FOR UPDATE
TO authenticated
USING (
  deleted_at IS NULL 
  AND (
    is_admin_provinsi(auth.uid()) 
    OR (has_role(auth.uid(), 'admin_kab_kota'::app_role) AND kabupaten_kota_id = get_user_kabupaten_kota(auth.uid()))
    OR (has_role(auth.uid(), 'panitia'::app_role) AND created_by = auth.uid() AND status = 'DIAJUKAN')
  )
)
WITH CHECK (
  is_admin_provinsi(auth.uid()) 
  OR (has_role(auth.uid(), 'admin_kab_kota'::app_role) AND kabupaten_kota_id = get_user_kabupaten_kota(auth.uid()))
  OR (has_role(auth.uid(), 'panitia'::app_role) AND created_by = auth.uid() AND status = 'DIAJUKAN')
  OR deleted_at IS NOT NULL
);
CREATE POLICY "Admin provinsi can restore events"
ON public.events
FOR UPDATE
TO authenticated
USING (
  deleted_at IS NOT NULL 
  AND is_admin_provinsi(auth.uid())
)
WITH CHECK (is_admin_provinsi(auth.uid()));
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS email TEXT;
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id AND p.email IS NULL;
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public 
AS $$
BEGIN
  INSERT INTO public.profiles (
    id, 
    full_name,
    email,
    kabupaten_kota_id,
    requested_role,
    registration_status,
    is_profile_complete,
    is_active
  )
  VALUES (
    new.id, 
    COALESCE(new.raw_user_meta_data->>'full_name', new.email),
    new.email,
    (new.raw_user_meta_data->>'kabupaten_kota_id')::uuid,
    new.raw_user_meta_data->>'requested_role',
    'pending',
    false,
    true
  );
  RETURN new;
END;
$$;
CREATE OR REPLACE FUNCTION public.sync_user_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public 
AS $$
BEGIN
  UPDATE public.profiles
  SET email = NEW.email
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS on_auth_user_email_updated ON auth.users;
CREATE TRIGGER on_auth_user_email_updated
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW
  WHEN (OLD.email IS DISTINCT FROM NEW.email)
  EXECUTE FUNCTION public.sync_user_email();
CREATE OR REPLACE VIEW public.public_referees AS
SELECT 
  p.id,
  p.full_name,
  p.profile_photo_url,
  p.license_level,
  p.afk_origin,
  COALESCE(rs.avg_rating, 0) as avg_rating,
  COALESCE(rs.total_reviews, 0) as total_reviews
FROM public.profiles p
INNER JOIN public.user_roles ur ON ur.user_id = p.id
LEFT JOIN public.referee_review_stats rs ON rs.referee_id = p.id
WHERE ur.role = 'wasit'
  AND p.is_profile_complete = true
  AND p.deleted_at IS NULL;
GRANT SELECT ON public.public_referees TO anon, authenticated;
DROP VIEW IF EXISTS public.public_referees;
CREATE VIEW public.public_referees 
WITH (security_invoker = true) AS
SELECT 
  p.id,
  p.full_name,
  p.profile_photo_url,
  p.license_level,
  p.afk_origin,
  COALESCE(rs.avg_rating, 0) as avg_rating,
  COALESCE(rs.total_reviews, 0) as total_reviews
FROM public.profiles p
INNER JOIN public.user_roles ur ON ur.user_id = p.id
LEFT JOIN public.referee_review_stats rs ON rs.referee_id = p.id
WHERE ur.role = 'wasit'
  AND p.is_profile_complete = true
  AND p.deleted_at IS NULL;
GRANT SELECT ON public.public_referees TO anon, authenticated;
CREATE POLICY "Public can check wasit role" 
ON public.user_roles 
FOR SELECT 
USING (role = 'wasit');
CREATE TABLE public.system_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value TEXT,
  description TEXT,
  updated_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin provinsi can manage settings" 
ON public.system_settings 
FOR ALL 
USING (is_admin_provinsi(auth.uid()));
CREATE POLICY "Everyone can view settings" 
ON public.system_settings 
FOR SELECT 
USING (true);
CREATE TRIGGER update_system_settings_updated_at
  BEFORE UPDATE ON public.system_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
INSERT INTO public.system_settings (key, value, description) VALUES
  ('association_email', 'sulsel.afp@gmail.com', 'Email tujuan notifikasi pengajuan event'),
  ('sender_email_name', 'FFI Sulsel', 'Nama pengirim email'),
  ('organization_name', 'Federasi Futsal Indonesia - Sulawesi Selatan', 'Nama organisasi'),
  ('organization_phone', '(0411) 123-4567', 'Nomor telepon organisasi'),
  ('organization_address', 'Jl. Perintis Kemerdekaan KM 12, Makassar', 'Alamat organisasi'),
  ('organization_email', 'info@ffisulsel.or.id', 'Email publik organisasi');
INSERT INTO public.system_settings (key, value, description) VALUES
  ('sender_email_address', 'onboarding@resend.dev', 'Alamat email pengirim (domain terverifikasi Resend)')
ON CONFLICT (key) DO NOTHING;
DROP FUNCTION IF EXISTS public.get_pending_registrations();
DROP FUNCTION IF EXISTS public.get_registration_history();
CREATE FUNCTION public.get_pending_registrations()
 RETURNS TABLE(id uuid, full_name text, email text, kabupaten_kota_id uuid, kabupaten_kota_name text, requested_role text, registration_status text, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT 
    p.id,
    p.full_name,
    p.email,
    p.kabupaten_kota_id,
    kk.name as kabupaten_kota_name,
    p.requested_role,
    p.registration_status,
    p.created_at
  FROM public.profiles p
  LEFT JOIN public.kabupaten_kota kk ON kk.id = p.kabupaten_kota_id
  WHERE p.registration_status = 'pending'
    AND (
      is_admin_provinsi(auth.uid())
      OR (
        has_role(auth.uid(), 'admin_kab_kota') 
        AND p.kabupaten_kota_id = get_user_kabupaten_kota(auth.uid())
      )
    )
  ORDER BY p.created_at ASC;
$function$;
CREATE FUNCTION public.get_registration_history()
 RETURNS TABLE(id uuid, full_name text, email text, kabupaten_kota_id uuid, kabupaten_kota_name text, requested_role text, registration_status text, rejected_reason text, approved_at timestamp with time zone, approved_by uuid, approver_name text, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT 
    p.id,
    p.full_name,
    p.email,
    p.kabupaten_kota_id,
    kk.name as kabupaten_kota_name,
    p.requested_role,
    p.registration_status,
    p.rejected_reason,
    p.approved_at,
    p.approved_by,
    approver.full_name as approver_name,
    p.created_at
  FROM public.profiles p
  LEFT JOIN public.kabupaten_kota kk ON kk.id = p.kabupaten_kota_id
  LEFT JOIN public.profiles approver ON approver.id = p.approved_by
  WHERE p.registration_status IN ('approved', 'rejected')
    AND p.approved_at IS NOT NULL
    AND (
      is_admin_provinsi(auth.uid())
      OR (
        has_role(auth.uid(), 'admin_kab_kota') 
        AND p.kabupaten_kota_id = get_user_kabupaten_kota(auth.uid())
      )
    )
  ORDER BY p.approved_at DESC;
$function$;