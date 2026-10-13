import type { XlsxSheet } from '../common/xlsx'

export const STRUCTURE_IMPORT_HEADERS = ['Code', 'Nom', 'Code parent', 'Ville', 'Téléphone', 'E-mail', 'Adresse', 'Horaire du culte']

export function cepcaImportTemplateSheets(): XlsxSheet[] {
  return [
    {
      name: 'Structures',
      rows: [
        STRUCTURE_IMPORT_HEADERS,
      ],
    },
    {
      name: 'Responsables',
      rows: [
        ['Nom complet', 'Téléphone', 'E-mail', 'Code structure', 'Rôle souhaité', 'Titre/Fonction', 'Date début mandat', 'Date fin mandat', 'Observations'],
      ],
    },
    {
      name: 'Confessions',
      rows: [
        ['Code confession', 'Nom confession', 'Téléphone', 'E-mail', 'Ville siège', 'Niveaux prévus', 'Responsable CEPCA référent', 'Observations'],
      ],
    },
    {
      name: 'Exemple',
      rows: [
        ['Onglet', 'Code', 'Nom complet / Nom structure', 'Code parent / Code structure', 'Rôle ou niveau', 'Téléphone', 'E-mail'],
        ['Structures', 'SYN001', 'Synode du Littoral', 'EEC', 'Synode', '', ''],
        ['Structures', 'CON001', 'Consistoire Douala-Centre', 'SYN001', 'Consistoire', '', ''],
        ['Structures', 'PAR001', 'Paroisse de Deido', 'CON001', 'Paroisse', '+237699000000', 'contact@example.org'],
        ['Structures', 'CHA001', 'Chapelle de Bonamoussadi', 'PAR001', 'Chapelle', '', ''],
        ['Responsables', '', 'Jean Exemple', 'PAR001', 'Responsable paroisse', '+237699000000', 'jean@example.org'],
        ['Confessions', 'EEC', 'Eglise Evangélique du Cameroun', '', 'Synode > Consistoire > Paroisse > Chapelle', '', ''],
      ],
    },
    {
      name: 'Codes et roles',
      rows: [
        ['Type', 'Valeur', 'Commentaire'],
        ['Code', 'EEC', 'Code court de la confession, déjà créé dans la plateforme'],
        ['Code', 'SYN001', 'Code unique du synode dans cette confession'],
        ['Code', 'CON001', 'Code unique du consistoire dans cette confession'],
        ['Code', 'PAR001', 'Code unique de la paroisse dans cette confession'],
        ['Code', 'CHA001', 'Code unique de la chapelle dans cette confession'],
        ['Rôle', 'Administrateur confession', 'Gère une confession complète'],
        ['Rôle', 'Responsable synode', 'Gère le synode et ses structures filles'],
        ['Rôle', 'Responsable consistoire', 'Gère un consistoire'],
        ['Rôle', 'Responsable paroisse', 'Gère une paroisse'],
        ['Rôle', 'Responsable chapelle', 'Gère une chapelle'],
        ['Rôle', 'Responsable financier', 'Accès aux informations financières autorisées'],
        ['Rôle', 'Responsable communication', 'Publie ou modère les contenus autorisés'],
      ],
    },
    {
      name: 'Guide',
      rows: [
        ['Etape', 'Consigne'],
        ['1', 'CEPCA remplit d’abord l’onglet Confessions pour lister les confessions et leurs niveaux.'],
        ['2', 'Dans la plateforme, créer chaque confession avec sa hiérarchie de niveaux.'],
        ['3', 'Donner un fichier par confession au responsable concerné.'],
        ['4', 'Le responsable remplit l’onglet Structures en gardant les colonnes dans le même ordre.'],
        ['5', 'Chaque ligne doit avoir un Code parent déjà existant ou présent dans une ligne au-dessus.'],
        ['6', 'L’onglet Responsables sert à collecter les identités des acteurs. Il n’est pas encore importé automatiquement.'],
        ['7', 'Après validation par CEPCA, utiliser Utilisateurs/Rôles pour créer les comptes et affecter les permissions.'],
      ],
    },
  ]
}
