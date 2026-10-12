-- Back-office : un responsable nommé définit lui-même son mot de passe (code SMS), jamais transmis par un tiers.
ALTER TYPE "OtpPurpose" ADD VALUE IF NOT EXISTS 'PASSWORD_RESET';
