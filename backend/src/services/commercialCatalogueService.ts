import type {
  CatalogueReconciliationResult,
  PublicCommercialCatalogue,
} from '../postgres/commercialRepository.js';

export interface CommercialCatalogueRepository {
  getPublicCatalogue(): Promise<PublicCommercialCatalogue>;
  reconcileCatalogue(): Promise<CatalogueReconciliationResult>;
}

export const createCommercialCatalogueService = (
  repository: CommercialCatalogueRepository,
) => ({
  getPublic: () => repository.getPublicCatalogue(),
  reconcile: () => repository.reconcileCatalogue(),
});
