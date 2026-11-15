-- Recherche de l'app (parcours 3) : « deido » doit trouver « Paroisse de Deïdo ». Sur un téléphone,
-- les accents sont souvent omis à la saisie. unaccent est une extension « de confiance » depuis
-- PostgreSQL 13 : le propriétaire de la base peut la créer sans être superutilisateur.
CREATE EXTENSION IF NOT EXISTS unaccent;
