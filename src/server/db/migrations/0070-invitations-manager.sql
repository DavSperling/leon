-- 0070-invitations-manager.sql : le lien d'invitation porte aussi le manager de la personne invitée (écran Équipe :
-- « Ajouter quelqu'un sous … »). joinWithInvitation la rattache à lui à son arrivée. Le manager parti, le lien fait
-- toujours entrer, sans rattachement.
-- Elle s'appelait 0065 avant la fusion avec main, qui avait pris ce numéro : « if not exists » pour les bases locales
-- où elle est déjà passée sous son ancien nom.
alter table invitation_links
  add column if not exists manager_id uuid references member(id) on delete set null;
