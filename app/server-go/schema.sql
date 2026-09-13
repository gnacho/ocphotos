-- OpenCloud Memories — photos-service
-- PostgreSQL 16+ (pgvector/VectorChord opcional hasta la fase ML)

CREATE TABLE assets (
    id            BIGSERIAL PRIMARY KEY,
    user_id       TEXT NOT NULL,               -- sub de OIDC
    path          TEXT NOT NULL,               -- ruta WebDAV completa
    etag          TEXT NOT NULL,               -- invalidación de caché/re-index
    filename      TEXT NOT NULL,
    media_type    TEXT NOT NULL DEFAULT 'image', -- image | video
    taken_at      TIMESTAMPTZ NOT NULL,        -- EXIF DateTimeOriginal (fallback: mtime)
    width         INT,
    height        INT,
    camera_make   TEXT,
    camera_model  TEXT,
    lens          TEXT,
    iso           INT,
    aperture      NUMERIC(4,1),
    shutter       TEXT,
    focal_mm      NUMERIC(5,1),
    lat           DOUBLE PRECISION,
    lon           DOUBLE PRECISION,
    geocode       JSONB,                       -- reverse geocode cache (ciudad, país)
    is_favorite   BOOLEAN NOT NULL DEFAULT FALSE,
    is_archived   BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at    TIMESTAMPTZ,                 -- soft-delete cuando desaparece del DAV
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, path)
);

CREATE INDEX assets_user_taken ON assets (user_id, taken_at DESC);
CREATE INDEX assets_user_geo   ON assets (user_id) WHERE lat IS NOT NULL;
CREATE INDEX assets_etag       ON assets (etag);

-- timeline pre-agregado por día (consulta principal de la app)
CREATE MATERIALIZED VIEW day_buckets AS
SELECT user_id,
       date_trunc('day', taken_at) AS day,
       count(*)                    AS n
FROM assets
WHERE deleted_at IS NULL AND is_archived = FALSE
GROUP BY user_id, date_trunc('day', taken_at);

CREATE TABLE persons (
    id         BIGSERIAL PRIMARY KEY,
    user_id    TEXT NOT NULL,
    name       TEXT,
    face_thumb BYTEA,          -- recorte de cara
    -- embedding VECTOR(512), -- InsightFace (fase 3, pgvector)
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE asset_faces (
    asset_id BIGINT REFERENCES assets(id) ON DELETE CASCADE,
    person_id BIGINT REFERENCES persons(id) ON DELETE SET NULL,
    bbox     INT4RANGE,        -- simplificado; en real: 4 columnas x1,y1,x2,y2
    PRIMARY KEY (asset_id, person_id)
);

CREATE TABLE albums (
    id         BIGSERIAL PRIMARY KEY,
    user_id    TEXT NOT NULL,
    name       TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE album_assets (
    album_id BIGINT REFERENCES albums(id) ON DELETE CASCADE,
    asset_id BIGINT REFERENCES assets(id) ON DELETE CASCADE,
    position INT NOT NULL DEFAULT 0,
    PRIMARY KEY (album_id, asset_id)
);

-- cola de trabajos: River usa sus propias tablas (river migrate)
-- jobs: ScanFolder → IndexAsset → ExtractExif → MakeThumbs → (fase3) DetectFaces/ClipEmbed
