-- 0073-agendas-a-refaire.sql : les calendriers déjà préparés sont effacés, pour que chacun se refasse à la prochaine
-- visite de l'Accueil avec la nouvelle lecture des e-mails (ceux qui annoncent un rendez-vous d'abord, réponse du
-- modèle lue plus largement). Sans cela, un calendrier vide préparé par la première version restait affiché jusqu'au
-- prochain e-mail et au moins trois heures. Ce n'est qu'un cache (0072) : rien n'est perdu.
delete from agendas;
