-- 0065-invitations-manager.sql : le lien d'invitation porte aussi le manager de la personne invitée (écran Équipe :
-- « Ajouter quelqu'un sous … »). joinWithInvitation la rattache à lui à son arrivée. Le manager parti, le lien fait
-- toujours entrer, sans rattachement.
alter table invitation_links
  add column manager_id uuid references member(id) on delete set null;
