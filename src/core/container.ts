import 'reflect-metadata';
import {container} from 'tsyringe-neo';
import {SoloLogger} from './logging.js';
import {
    Helm,
    K8,
    ChartManager,
    ConfigManager,
    DependencyManager,
    LeaseManager,
    LocalConfig,
    constants,
    ProfileManager, PackageDownloader, PlatformInstaller, KeyManager, AccountManager, CertificateManager, Zippy
} from '../core/index.js';
import type {LeaseRenewalService} from "./lease/lease_renewal.js";
import {IntervalLeaseRenewalService} from "./lease/lease_renewal.js";
import {HelmDependencyManager} from "./dependency_managers/index.js";
import os from "os";
import path from "path";

// Register the dependencies
container.register<SoloLogger>('logger', {useClass: SoloLogger});

container.register<PackageDownloader>('downloader', {useClass: PackageDownloader});
container.register<Zippy>('zippy', {useClass: Zippy});
container.register<HelmDependencyManager>('helmDepManager', {useClass: HelmDependencyManager});

container.register('osPlatform', {useValue: os.platform()})

const helmDepManager = container.resolve('helmDepManager')
container.register('depManagerMap', {useValue: new Map().set(constants.HELM, helmDepManager)});
container.register<DependencyManager>('dependencyManager', {useClass: DependencyManager});

container.register<Helm>('helm', {useClass: Helm});
container.register<K8>('k8', {useClass: K8});
container.register<ChartManager>('chartManager', {useClass: ChartManager});
container.register<ConfigManager>('configManager', {useClass: ConfigManager});

container.register<LeaseRenewalService>('leaseRenewalService', {useClass: IntervalLeaseRenewalService});
container.register<LeaseManager>('leaseManager', {useClass: LeaseManager});
container.register<LocalConfig>('localConfig', {useClass: LocalConfig});
container.register<ProfileManager>('profileManager', {useClass: ProfileManager});

container.register<PlatformInstaller>('platformInstaller', {useClass: PlatformInstaller});
container.register<KeyManager>('keyManager', {useClass: KeyManager});
container.register<AccountManager>('accountManager', {useClass: AccountManager});
container.register<CertificateManager>('certificateManager', {useClass: CertificateManager});

container.register('systemAccounts', {useValue: constants.SYSTEM_ACCOUNTS});
container.register('cacheDir', {useValue: constants.SOLO_VALUES_DIR});
container.register('filePath', {useValue: path.join(constants.SOLO_CACHE_DIR, constants.DEFAULT_LOCAL_CONFIG_FILE)});

export {container};