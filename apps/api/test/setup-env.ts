// Chargé avant chaque fichier de test : la configuration de test prime sur .env.
process.env.NODE_ENV = 'test'
// Les tests ne sortent jamais sur Internet : notifications push et e-mails restent simulés, quel que soit .env
process.env.VAPID_PUBLIC_KEY = ''
process.env.VAPID_PRIVATE_KEY = ''
process.env.MAIL_MODE = 'console'
