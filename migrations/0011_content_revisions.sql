-- Extend the existing publishing system. Public commerce_content remains authoritative.
alter table commerce_documents drop constraint commerce_documents_scope_check;
alter table commerce_documents add constraint commerce_documents_scope_check
 check(scope in ('calibration','gallery','storefront','pricing','content'));
