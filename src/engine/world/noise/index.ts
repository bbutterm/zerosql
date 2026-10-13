/**
 * Порядок генераторов шума. Он фиксирован: следующие опираются на
 * состояние предыдущих (население → организации → сотрудники → события),
 * а изменение порядка сдвинет потоки ГСЧ и id.
 */
import type { WorldContext } from "../context";
import { generateAddresses, generatePersons, generateRegistrations } from "./people";
import {
  generateCompanies, generateCompanyOwners, generateContracts, generateEmployment, generateGrantRequests,
  generateProperties, generateShareDeals,
} from "./org";
import {
  generateAttachments, generateCases, generateDocRegistry, generateEvidenceRegistry, generateIncidentPersons,
  generateIncidents, generateLogins, generateMigrationJobs, generateStaff, generateStatements, generateWorkstations,
} from "./police";
import { generateAuditLog, generateQueryLog } from "./logs";
import {
  generateCameras, generateDeliveries, generateHeatReadings, generateHospital, generateIntercom, generateMorgue,
  generatePlateReads, generateTransitTaps, generateVehicles, generateZags,
} from "./city";
import { generateAccounts, generateDoorAccess, generateMessenger, generatePhones, generatePurchases, generateTransactions } from "./money";
import {
  generateConstructionDocs, generateDiverReports, generateGsComms, generateGsPhonebook, generateOutfallTemp,
} from "./archive";

export function generateNoise(ctx: WorldContext, timings?: Record<string, number>): void {
  const steps: [string, () => void][] = [
    ["persons", () => generatePersons(ctx)],
    ["addresses", () => generateAddresses(ctx)],
    ["registrations", () => generateRegistrations(ctx)],
    ["companies", () => generateCompanies(ctx)],
    ["company_owners", () => generateCompanyOwners(ctx)],
    ["employment", () => generateEmployment(ctx)],
    ["properties", () => generateProperties(ctx)],
    ["contracts", () => generateContracts(ctx)],
    ["grant_requests", () => generateGrantRequests(ctx)],
    ["share_deals", () => generateShareDeals(ctx)],
    ["workstations", () => generateWorkstations(ctx)],
    ["staff", () => generateStaff(ctx)],
    ["logins", () => generateLogins(ctx)],
    ["vehicles", () => generateVehicles(ctx)],
    ["cameras", () => generateCameras(ctx)],
    ["incidents", () => generateIncidents(ctx)],
    ["incident_persons", () => generateIncidentPersons(ctx)],
    ["cases", () => generateCases(ctx)],
    ["doc_registry", () => generateDocRegistry(ctx)],
    ["statements", () => generateStatements(ctx)],
    ["evidence_registry", () => generateEvidenceRegistry(ctx)],
    ["attachments", () => generateAttachments(ctx)],
    ["migration_jobs", () => generateMigrationJobs(ctx)],
    ["audit_log", () => generateAuditLog(ctx)],
    ["query_log", () => generateQueryLog(ctx)],
    ["plate_reads", () => generatePlateReads(ctx)],
    ["intercom_events", () => generateIntercom(ctx)],
    ["heat_readings", () => generateHeatReadings(ctx)],
    ["delivery_orders", () => generateDeliveries(ctx)],
    ["transit_taps", () => generateTransitTaps(ctx)],
    ["zags_deaths", () => generateZags(ctx)],
    ["morgue_records", () => generateMorgue(ctx)],
    ["hospital_admissions", () => generateHospital(ctx)],
    ["phones", () => generatePhones(ctx)],
    ["accounts", () => generateAccounts(ctx)],
    ["transactions", () => generateTransactions(ctx)],
    ["messenger_events", () => generateMessenger(ctx)],
    ["door_access", () => generateDoorAccess(ctx)],
    ["purchases", () => generatePurchases(ctx)],
    ["construction_docs", () => generateConstructionDocs(ctx)],
    ["outfall_temp", () => generateOutfallTemp(ctx)],
    ["diver_reports", () => generateDiverReports(ctx)],
    ["gs_comms_2015", () => generateGsComms(ctx, generateGsPhonebook(ctx))],
  ];
  for (const [name, run] of steps) {
    const t0 = timings ? performance.now() : 0;
    run();
    if (timings) timings[name] = Math.round((performance.now() - t0) * 10) / 10;
  }
}
