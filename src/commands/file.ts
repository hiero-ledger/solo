// SPDX-License-Identifier: Apache-2.0

import chalk from 'chalk';
import {BaseCommand} from './base.js';
import {SoloError} from '../core/errors/solo-error.js';
import {Flags as flags} from './flags.js';
import {Listr} from 'listr2';
import * as constants from '../core/constants.js';
import {type AccountManager} from '../core/account-manager.js';
import {
  FileCreateTransaction,
  FileUpdateTransaction,
  FileAppendTransaction,
  FileContentsQuery,
  FileInfoQuery,
  FileId,
  Status,
  PrivateKey,
} from '@hiero-ledger/sdk';
import {type ArgvStruct} from '../types/aliases.js';
import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../core/dependency-injection/container-helper.js';
import {type CommandFlags} from '../types/flag-types.js';
import {type DeploymentName, type SoloListr, type SoloListrTask} from '../types/index.js';
import {type NamespaceName} from '../types/namespace/namespace-name.js';
import fs from 'node:fs';
import path from 'node:path';

interface FileUploadConfig {
  fileId: string;
  filePath: string;
  deployment: DeploymentName;
  namespace: NamespaceName;
}

interface FileUploadContext {
  config: FileUploadConfig;
  fileExists: boolean;
  fileContent: Uint8Array;
  uploadedSize: number;
  expectedSize: number;
  treasuryPrivateKey: PrivateKey;
}

@injectable()
export class FileCommand extends BaseCommand {
  // Hedera's max content size per transaction
  private static readonly MAX_CHUNK_SIZE = 4096;

  public constructor(@inject(InjectTokens.AccountManager) private readonly accountManager: AccountManager) {
    super();
    this.accountManager = patchInject(accountManager, InjectTokens.AccountManager, this.constructor.name);
  }

  public static CREATE_FLAGS_LIST: CommandFlags = {
    required: [flags.deployment, flags.filePath],
    optional: [],
  };

  public static UPDATE_FLAGS_LIST: CommandFlags = {
    required: [flags.deployment, flags.fileId, flags.filePath],
    optional: [],
  };

  public async close(): Promise<void> {
    await this.accountManager.close();
  }

  /**
   * Helper method to prepare initial content and determine if append is needed
   * @param fileContent - The complete file content
   * @param operation - The operation being performed ('create' or 'update')
   * @returns Object with initialContent and needsAppend flag
   */
  private prepareInitialContent(
    fileContent: Uint8Array,
    operation: 'create' | 'update',
  ): {initialContent: Uint8Array; needsAppend: boolean} {
    const needsAppend: boolean = fileContent.length > FileCommand.MAX_CHUNK_SIZE;

    let initialContent: Uint8Array;
    if (needsAppend) {
      initialContent = fileContent.slice(0, FileCommand.MAX_CHUNK_SIZE);
      this.logger.showUser(
        chalk.gray(
          `  ${operation === 'create' ? 'Creating' : 'Updating'} file with first ${initialContent.length} bytes (multi-part ${operation})...`,
        ),
      );
    } else {
      initialContent = fileContent;
      this.logger.showUser(chalk.gray(`  ${operation === 'create' ? 'Creating' : 'Updating'} file with ${initialContent.length} bytes...`));
    }

    return {initialContent, needsAppend};
  }

  /**
   * Helper method to initialize configuration and read file content
   * @param argv - Command arguments
   * @param requireFileId - Whether file ID is required (true for update, false for create)
   * @returns Configuration context with file content
   */
  private async initializeFileConfig(
    argv: ArgvStruct,
    requireFileId: boolean,
  ): Promise<{
    config: FileUploadConfig;
    fileContent: Uint8Array;
    expectedSize: number;
  }> {
    // Load configurations
    await this.localConfig.load();
    await this.remoteConfig.loadAndValidate(argv);
    this.configManager.update(argv);

    const filePath: string = argv[flags.filePath.name] as string;
    const deployment: DeploymentName = argv[flags.deployment.name] as DeploymentName;
    const namespace: NamespaceName = this.remoteConfig.getNamespace();

    let fileId: string = '';
    if (requireFileId) {
      fileId = argv[flags.fileId.name] as string;
      // Validate file ID format
      if (!fileId.match(/^\d+\.\d+\.\d+$/)) {
        throw new SoloError(`Invalid file ID format: ${fileId}. Expected format: 0.0.150`);
      }
    }

    // Validate file exists
    if (!fs.existsSync(filePath)) {
      throw new SoloError(`File not found: ${filePath}`);
    }

    // Read file content
    const fileContent: Buffer = fs.readFileSync(filePath);
    const fileName: string = path.basename(filePath);

    this.logger.showUser(chalk.cyan(`File: ${fileName}`));
    this.logger.showUser(chalk.cyan(`Size: ${fileContent.length} bytes`));
    if (requireFileId) {
      this.logger.showUser(chalk.cyan(`File ID: ${fileId}`));
    }

    const config: FileUploadConfig = {
      fileId,
      filePath,
      deployment,
      namespace,
    };

    return {
      config,
      fileContent,
      expectedSize: fileContent.length,
    };
  }

  /**
   * Helper method to load node client and treasury keys
   * @param namespace - The namespace
   * @param deployment - The deployment name
   * @param useGenesisKeyForSystemFile - Whether to use genesis key for system file operations
   * @returns The private key to use for transactions
   */
  private async loadClientAndKeys(
    namespace: NamespaceName,
    deployment: DeploymentName,
    useGenesisKeyForSystemFile: boolean = false,
  ): Promise<PrivateKey> {
    // Load node client
    await this.accountManager.loadNodeClient(namespace, this.remoteConfig.getClusterRefs(), deployment);

    // Use genesis key for system file operations if requested
    if (useGenesisKeyForSystemFile) {
      this.logger.showUser(chalk.cyan('Using genesis key for system file operations'));
      this.logger.showUser(
        chalk.gray(
          `  Genesis key can be customized via GENESIS_KEY environment variable`,
        ),
      );
      return PrivateKey.fromString(constants.GENESIS_KEY);
    }

    // Get treasury account keys
    const treasuryKeys = await this.accountManager.getTreasuryAccountKeys(namespace, deployment);
    return PrivateKey.fromString(treasuryKeys.privateKey);
  }

  /**
   * Helper method to verify uploaded file content
   * @param client - The Hedera client
   * @param fileId - The file ID to verify
   * @param expectedContent - The expected file content
   */
  private async verifyFileUpload(client: any, fileId: string, expectedContent: Uint8Array): Promise<void> {
    const fileIdObj: FileId = FileId.fromString(fileId);

    this.logger.showUser(chalk.cyan('Querying file contents to verify upload...'));

    const fileContentsQuery: FileContentsQuery = new FileContentsQuery().setFileId(fileIdObj);
    const retrievedContents: Uint8Array = await fileContentsQuery.execute(client);

    const uploadedSize: number = retrievedContents.length;
    const expectedSize: number = expectedContent.length;

    this.logger.showUser(chalk.gray(`  Expected size: ${expectedSize} bytes`));
    this.logger.showUser(chalk.gray(`  Retrieved size: ${uploadedSize} bytes`));

    if (uploadedSize !== expectedSize) {
      // Check if this is a system file (0.0.101-0.0.200 range)
      const fileIdParts: string[] = fileId.split('.');
      const fileNum: number = parseInt(fileIdParts[2]);
      const isSystemFile: boolean = fileNum >= 101 && fileNum <= 200;
      
      let errorMessage: string = `File size mismatch! Expected ${expectedSize} bytes but got ${uploadedSize} bytes`;
      if (isSystemFile && uploadedSize === 0) {
        errorMessage += `\n\n⚠️  System File Update Failed:`;
        errorMessage += `\nFile ${fileId} is a system file that appears to be immutable or requires special authorization.`;
        errorMessage += `\n\nPossible reasons:`;
        errorMessage += `\n1. The genesis key may not have permission to update this specific system file`;
        errorMessage += `\n2. System file ${fileId} may require network-level authorization or freeze/unfreeze operations`;
        errorMessage += `\n3. The network may be using a different genesis key than expected`;
        errorMessage += `\n\nTroubleshooting:`;
        errorMessage += `\n• Verify the correct genesis key using: echo $GENESIS_KEY`;
        errorMessage += `\n• Set custom genesis key: export GENESIS_KEY=<your-genesis-key>`;
        errorMessage += `\n• Check if the file requires special permissions beyond genesis key`;
        errorMessage += `\n• Consider using FileUpdateTransaction with additional authorization in custom code`;
      }
      throw new SoloError(errorMessage);
    }

    // Also verify content matches
    const contentsMatch: boolean = Buffer.from(retrievedContents).equals(Buffer.from(expectedContent));
    if (!contentsMatch) {
      throw new SoloError('File content verification failed! Retrieved content does not match uploaded content');
    }

    this.logger.showUser(chalk.green(`✓ File verification successful`));
    this.logger.showUser(chalk.green(`✓ Size: ${uploadedSize} bytes`));
    this.logger.showUser(chalk.green(`✓ Content matches uploaded file`));
  }

  /**
   * Helper method to append remaining file chunks after initial create/update
   * @param task - The Listr task wrapper for updating progress
   * @param client - The Hedera client
   * @param fileId - The file ID to append to
   * @param fileContent - The complete file content
   * @param treasuryPrivateKey - The private key to sign transactions
   */
  private async appendFileChunks(
    task: any,
    client: any,
    fileId: string,
    fileContent: Uint8Array,
    treasuryPrivateKey: PrivateKey,
  ): Promise<void> {
    const fileIdObj: FileId = FileId.fromString(fileId);
    let offset: number = FileCommand.MAX_CHUNK_SIZE;
    let chunkIndex: number = 1;

    // Calculate total chunks needed
    const totalChunks: number = Math.ceil((fileContent.length - FileCommand.MAX_CHUNK_SIZE) / FileCommand.MAX_CHUNK_SIZE);

    while (offset < fileContent.length) {
      const chunk: Uint8Array = fileContent.slice(offset, offset + FileCommand.MAX_CHUNK_SIZE);
      const remaining: number = fileContent.length - offset;

      // Update task title to show progress
      task.title = `Append remaining file content (chunk ${chunkIndex}/${totalChunks})`;

      this.logger.showUser(
        chalk.gray(`  Appending chunk ${chunkIndex}/${totalChunks} (${chunk.length} bytes, ${remaining} bytes remaining)...`),
      );

      const fileAppendTx: FileAppendTransaction = new FileAppendTransaction()
        .setFileId(fileIdObj)
        .setContents(chunk)
        .setMaxTransactionFee(100)
        .freezeWith(client);

      const signedAppendTx: FileAppendTransaction = await fileAppendTx.sign(treasuryPrivateKey);
      const appendResponse: any = await signedAppendTx.execute(client);
      const appendReceipt: any = await appendResponse.getReceipt(client);

      if (appendReceipt.status !== Status.Success) {
        throw new SoloError(`File append (chunk ${chunkIndex}) failed with status: ${appendReceipt.status.toString()}`);
      }

      offset += FileCommand.MAX_CHUNK_SIZE;
      chunkIndex++;
    }

    // Update final title
    task.title = `Append remaining file content (${totalChunks} chunks completed)`;
    this.logger.showUser(chalk.green(`✓ Appended ${totalChunks} chunks successfully`));
  }

  /**
   * Unified method to create or update a file on the Hedera network
   * @param argv - Command arguments
   * @param isCreate - True for create operation, false for update
   */
  private async executeFileOperation(argv: ArgvStruct, isCreate: boolean): Promise<boolean> {
    const self = this;

    interface Context extends FileUploadContext {
      createdFileId?: string;
      isSystemFile?: boolean;
    }

    const tasks = new Listr<Context>(
      [
        {
          title: 'Initialize configuration',
          task: async ctx => {
            const result: {config: FileUploadConfig; fileContent: Uint8Array; expectedSize: number} = await self.initializeFileConfig(argv, !isCreate);
            ctx.config = result.config;
            ctx.fileContent = result.fileContent;
            ctx.expectedSize = result.expectedSize;
            
            // Check if this is a system file (for update operations)
            if (!isCreate && ctx.config.fileId) {
              const fileIdParts: string[] = ctx.config.fileId.split('.');
              const fileNum: number = parseInt(fileIdParts[2]);
              ctx.isSystemFile = fileNum >= 101 && fileNum <= 200;
            }
          },
        },
        {
          title: 'Load node client and treasury keys',
          task: async ctx => {
            const useGenesisKey: boolean = ctx.isSystemFile || false;
            
            ctx.treasuryPrivateKey = await self.loadClientAndKeys(
              ctx.config.namespace,
              ctx.config.deployment,
              useGenesisKey,
            );
          },
        },
        {
          title: 'Check if file exists',
          skip: () => isCreate, // Skip for create operation
          task: async ctx => {
            const client: any = self.accountManager._nodeClient!;

            try {
              const fileIdObj: FileId = FileId.fromString(ctx.config.fileId);
              const fileInfoQuery: FileInfoQuery = new FileInfoQuery().setFileId(fileIdObj);
              const fileInfo: any = await fileInfoQuery.execute(client);

              ctx.fileExists = true;
              self.logger.showUser(chalk.green(`File ${ctx.config.fileId} exists. Proceeding with update.`));
              self.logger.showUser(chalk.gray(`  Current size: ${fileInfo.size.toString()} bytes`));
              const keysCount: number = fileInfo.keys ? fileInfo.keys.toArray().length : 0;
              self.logger.showUser(chalk.gray(`  Keys: ${keysCount}`));

              // Check if file is a system file (no keys = immutable)
              if (keysCount === 0) {
                if (ctx.isSystemFile) {
                  self.logger.showUser(
                    chalk.cyan(
                      `ℹ️  File ${ctx.config.fileId} is a system file (no keys). Automatically using genesis key for update.`,
                    ),
                  );
                } else {
                  self.logger.showUser(
                    chalk.yellow(
                      `⚠️  Warning: File ${ctx.config.fileId} has no keys but is not in system file range (0.0.101-0.0.200).`,
                    ),
                  );
                  self.logger.showUser(
                    chalk.yellow(
                      `    Update may fail. Set GENESIS_KEY environment variable if this file requires genesis key authorization.`,
                    ),
                  );
                }
              }
            } catch (error: any) {
              if (error.status === Status.FileDeleted || error.status === Status.InvalidFileId) {
                throw new SoloError(
                  `File ${ctx.config.fileId} does not exist. Use 'ledger file create' to create a new file.`,
                );
              } else {
                throw new SoloError(`Failed to query file info: ${error.message}`, error);
              }
            }
          },
        },
        {
          title: isCreate ? 'Create file on Hedera network' : 'Update file on Hedera network',
          task: async (ctx, task): Promise<SoloListr<Context>> => {
            const client: any = self.accountManager._nodeClient!;
            const subTasks: SoloListrTask<Context>[] = [];

            // Create or update file
            subTasks.push({
              title: isCreate ? 'Create new file' : 'Update existing file',
              task: async (ctx, task): Promise<SoloListr<Context> | void> => {
                const {initialContent, needsAppend}: {initialContent: Uint8Array; needsAppend: boolean} = self.prepareInitialContent(
                  ctx.fileContent,
                  isCreate ? 'create' : 'update',
                );

                if (isCreate) {
                  // Create new file
                  const fileCreateTx: FileCreateTransaction = new FileCreateTransaction()
                    .setKeys([ctx.treasuryPrivateKey.publicKey])
                    .setContents(initialContent)
                    .setMaxTransactionFee(100)
                    .freezeWith(client);

                  const signedTx: FileCreateTransaction = await fileCreateTx.sign(ctx.treasuryPrivateKey);
                  const txResponse: any = await signedTx.execute(client);
                  const receipt: any = await txResponse.getReceipt(client);

                  if (receipt.status !== Status.Success) {
                    throw new SoloError(`File creation failed with status: ${receipt.status.toString()}`);
                  }

                  const createdFileId: FileId | null = receipt.fileId;
                  ctx.createdFileId = createdFileId?.toString();
                  ctx.config.fileId = ctx.createdFileId!; // Update config with actual file ID

                  self.logger.showUser(chalk.green(`✓ File created with ID: ${ctx.createdFileId}`));
                } else {
                  // Update existing file
                  const fileIdObj: FileId = FileId.fromString(ctx.config.fileId);
                  const fileUpdateTx: FileUpdateTransaction = new FileUpdateTransaction()
                    .setFileId(fileIdObj)
                    .setContents(initialContent)
                    .setMaxTransactionFee(100)
                    .freezeWith(client);

                  const signedUpdateTx: FileUpdateTransaction = await fileUpdateTx.sign(ctx.treasuryPrivateKey);
                  const updateResponse: any = await signedUpdateTx.execute(client);
                  const updateReceipt: any = await updateResponse.getReceipt(client);

                  if (updateReceipt.status !== Status.Success) {
                    throw new SoloError(`File update failed with status: ${updateReceipt.status.toString()}`);
                  }

                  self.logger.showUser(chalk.green(`✓ File updated successfully`));
                }

                // Append remaining content if needed
                if (needsAppend) {
                  const appendSubtasks: SoloListrTask<Context>[] = [
                    {
                      title: 'Append remaining file content',
                      task: async (ctx, appendTask) => {
                        await self.appendFileChunks(
                          appendTask,
                          client,
                          ctx.config.fileId,
                          ctx.fileContent,
                          ctx.treasuryPrivateKey,
                        );
                      },
                    },
                  ];

                  return task.newListr(appendSubtasks, {
                    concurrent: false,
                    rendererOptions: {collapseSubtasks: false},
                  });
                }
              },
            });

            return task.newListr(subTasks, {
              concurrent: false,
              rendererOptions: {
                collapseSubtasks: false,
              },
            });
          },
        },
        {
          title: 'Verify uploaded file',
          task: async ctx => {
            const client = self.accountManager._nodeClient!;
            await self.verifyFileUpload(client, ctx.config.fileId, ctx.fileContent);
          },
        },
      ],
      {
        concurrent: false,
        rendererOptions: {
          collapseSubtasks: false,
          timer: constants.LISTR_DEFAULT_RENDERER_TIMER_OPTION,
        },
      },
    );

    try {
      await tasks.run();
      const context: Context = tasks.ctx as Context;
      
      if (isCreate) {
        this.logger.showUser(chalk.green('\n✅ File created successfully!'));
        this.logger.showUser(chalk.cyan(`📄 File ID: ${context.createdFileId}`));
      } else {
        this.logger.showUser(chalk.green('\n✅ File updated successfully!'));
      }
    } catch (error: any) {
      const operation: string = isCreate ? 'creation' : 'update';
      throw new SoloError(`File ${operation} failed: ${error.message}`, error);
    }

    return true;
  }

  /**
   * Create a new file on the Hedera network
   */
  public async create(argv: ArgvStruct): Promise<boolean> {
    return this.executeFileOperation(argv, true);
  }

  /**
   * Update an existing file on the Hedera network
   */
  public async update(argv: ArgvStruct): Promise<boolean> {
    return this.executeFileOperation(argv, false);
  }
}
