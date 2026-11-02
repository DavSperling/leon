-- 0044-invitations-poste.sql : le lien d'invitation porte le service, le poste et le niveau de la personne invitée,
-- et le nom saisi pour s'y retrouver (onboarding, lot 2). joinWithInvitation les recopie sur le membre. Nuls pour les
-- liens d'avant : le serveur exige les trois pour tout nouveau lien.
alter table invitation_links
  add column invitee_name text check (char_length(invitee_name) <= 100),
  add column department text,
  add column job text,
  add column seniority smallint check (seniority between 1 and 8);
