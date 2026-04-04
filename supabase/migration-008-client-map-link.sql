-- Add map_link column to clients for Google Maps pin location
ALTER TABLE clients ADD COLUMN IF NOT EXISTS map_link text;
