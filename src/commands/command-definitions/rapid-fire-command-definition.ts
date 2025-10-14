// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../../core/dependency-injection/container-helper.js';
import {BaseCommandDefinition} from './base-command-definition.js';
import {CommandBuilder, CommandGroup, Subcommand} from '../../core/command-path-builders/command-builder.js';
import {type CommandDefinition} from '../../types/index.js';
import {type SoloLogger} from '../../core/logging/solo-logger.js';
import * as constants from '../../core/constants.js';
import {RapidFireCommand} from '../rapid-fire.js';

@injectable()
export class RapidFireCommandDefinition extends BaseCommandDefinition {
  public constructor(
    @inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger,
    @inject(InjectTokens.RapidFireCommand) public readonly rapidFireCommand?: RapidFireCommand,
  ) {
    super();
    this.rapidFireCommand = patchInject(rapidFireCommand, InjectTokens.RapidFireCommand, this.constructor.name);
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
  }

  public static override readonly COMMAND_NAME = 'rapid-fire';

  public static readonly HCS_SUBCOMMAND_NAME = 'hcs';
  public static readonly CRYPTO_TRANSFER_SUBCOMMAND_NAME = 'crypto-transfer';
  public static readonly NFT_TRANSFER_SUBCOMMAND_NAME = 'nft-transfer';
  public static readonly TOKEN_TRANSFER_SUBCOMMAND_NAME = 'token-transfer';
  public static readonly SMART_CONTRACT_SUBCOMMAND_NAME = 'smart-contract';
  public static readonly HELI_SWAP_SUBCOMMAND_NAME = 'heli-swap';
  public static readonly LONGEVITY_SUBCOMMAND_NAME = 'longevity';
  public static readonly DESTROY_SUBCOMMAND_NAME = 'destroy';

  public static readonly START = 'start';
  public static readonly STOP = 'stop';
  public static readonly ALL = 'all';

  public static readonly RAPID_FIRE_HCS_START_COMMAND: string =
    `${RapidFireCommandDefinition.COMMAND_NAME} ${RapidFireCommandDefinition.HCS_SUBCOMMAND_NAME} ${RapidFireCommandDefinition.START}` as const;
  public static readonly RAPID_FIRE_HCS_STOP_COMMAND: string =
    `${RapidFireCommandDefinition.COMMAND_NAME} ${RapidFireCommandDefinition.HCS_SUBCOMMAND_NAME} ${RapidFireCommandDefinition.STOP}` as const;
  public static readonly RAPID_FIRE_CRYPTO_TRANSFER_START_COMMAND: string =
    `${RapidFireCommandDefinition.COMMAND_NAME} ${RapidFireCommandDefinition.CRYPTO_TRANSFER_SUBCOMMAND_NAME} ${RapidFireCommandDefinition.START}` as const;
  public static readonly RAPID_FIRE_CRYPTO_TRANSFER_STOP_COMMAND: string =
    `${RapidFireCommandDefinition.COMMAND_NAME} ${RapidFireCommandDefinition.CRYPTO_TRANSFER_SUBCOMMAND_NAME} ${RapidFireCommandDefinition.STOP}` as const;
  public static readonly RAPID_FIRE_NFT_TRANSFER_START_COMMAND: string =
    `${RapidFireCommandDefinition.COMMAND_NAME} ${RapidFireCommandDefinition.NFT_TRANSFER_SUBCOMMAND_NAME} ${RapidFireCommandDefinition.START}` as const;
  public static readonly RAPID_FIRE_NFT_TRANSFER_STOP_COMMAND: string =
    `${RapidFireCommandDefinition.COMMAND_NAME} ${RapidFireCommandDefinition.NFT_TRANSFER_SUBCOMMAND_NAME} ${RapidFireCommandDefinition.STOP}` as const;
  public static readonly RAPID_FIRE_TOKEN_TRANSFER_START_COMMAND: string =
    `${RapidFireCommandDefinition.COMMAND_NAME} ${RapidFireCommandDefinition.TOKEN_TRANSFER_SUBCOMMAND_NAME} ${RapidFireCommandDefinition.START}` as const;
  public static readonly RAPID_FIRE_TOKEN_TRANSFER_STOP_COMMAND: string =
    `${RapidFireCommandDefinition.COMMAND_NAME} ${RapidFireCommandDefinition.TOKEN_TRANSFER_SUBCOMMAND_NAME} ${RapidFireCommandDefinition.STOP}` as const;
  public static readonly RAPID_FIRE_SMART_CONTRACT_START_COMMAND: string =
    `${RapidFireCommandDefinition.COMMAND_NAME} ${RapidFireCommandDefinition.SMART_CONTRACT_SUBCOMMAND_NAME} ${RapidFireCommandDefinition.START}` as const;
  public static readonly RAPID_FIRE_SMART_CONTRACT_STOP_COMMAND: string =
    `${RapidFireCommandDefinition.COMMAND_NAME} ${RapidFireCommandDefinition.SMART_CONTRACT_SUBCOMMAND_NAME} ${RapidFireCommandDefinition.STOP}` as const;
  public static readonly RAPID_FIRE_HELI_SWAP_START_COMMAND: string =
    `${RapidFireCommandDefinition.COMMAND_NAME} ${RapidFireCommandDefinition.HELI_SWAP_SUBCOMMAND_NAME} ${RapidFireCommandDefinition.START}` as const;
  public static readonly RAPID_FIRE_HELI_SWAP_STOP_COMMAND: string =
    `${RapidFireCommandDefinition.COMMAND_NAME} ${RapidFireCommandDefinition.HELI_SWAP_SUBCOMMAND_NAME} ${RapidFireCommandDefinition.STOP}` as const;
  public static readonly RAPID_FIRE_LONGEVITY_START_COMMAND: string =
    `${RapidFireCommandDefinition.COMMAND_NAME} ${RapidFireCommandDefinition.LONGEVITY_SUBCOMMAND_NAME} ${RapidFireCommandDefinition.START}` as const;
  public static readonly RAPID_FIRE_LONGEVITY_STOP_COMMAND: string =
    `${RapidFireCommandDefinition.COMMAND_NAME} ${RapidFireCommandDefinition.LONGEVITY_SUBCOMMAND_NAME} ${RapidFireCommandDefinition.STOP}` as const;
  public static readonly RAPID_FIRE_DESTROY_ALL_COMMAND: string =
    `${RapidFireCommandDefinition.COMMAND_NAME} ${RapidFireCommandDefinition.DESTROY_SUBCOMMAND_NAME} ${RapidFireCommandDefinition.ALL}` as const;

  public getCommandDefinition(): CommandDefinition {
    return new CommandBuilder(RapidFireCommandDefinition.COMMAND_NAME, 'TODO', this.logger)
      .addCommandGroup(
        new CommandGroup(
          RapidFireCommandDefinition.HCS_SUBCOMMAND_NAME,
          'Run load tests using the network load generator with the HCSLoadTest class.',
        )
          .addSubcommand(
            new Subcommand(
              RapidFireCommandDefinition.START,
              'Start a rapid-fire HCS load test using the HCSLoadTest class.',
              this.rapidFireCommand,
              this.rapidFireCommand.hcsLoadStart,
              RapidFireCommand.START_FLAGS_LIST,
              [constants.HELM, constants.KUBECTL],
              false,
            ),
          )
          .addSubcommand(
            new Subcommand(
              RapidFireCommandDefinition.STOP,
              'Stop any running processes using the HCSLoadTest class.',
              this.rapidFireCommand,
              this.rapidFireCommand.hcsLoadStop,
              RapidFireCommand.STOP_FLAGS_LIST,
              [constants.HELM, constants.KUBECTL],
              false,
            ),
          ),
      )
      .addCommandGroup(
        new CommandGroup(
          RapidFireCommandDefinition.CRYPTO_TRANSFER_SUBCOMMAND_NAME,
          'Run load tests using the network load generator with the CryptoTransferLoadTest class',
        )
          .addSubcommand(
            new Subcommand(
              RapidFireCommandDefinition.START,
              'Start a rapid-fire crypto transfer load test using the CryptoTransferLoadTest class.',
              this.rapidFireCommand,
              this.rapidFireCommand.cryptoTransferStart,
              RapidFireCommand.START_FLAGS_LIST,
              [constants.HELM, constants.KUBECTL],
              false,
            ),
          )
          .addSubcommand(
            new Subcommand(
              RapidFireCommandDefinition.STOP,
              'Stop any running processes using the CryptoTransferLoadTest class.',
              this.rapidFireCommand,
              this.rapidFireCommand.cryptoTransferStop,
              RapidFireCommand.STOP_FLAGS_LIST,
              [constants.HELM, constants.KUBECTL],
              false,
            ),
          ),
      )
      .addCommandGroup(
        new CommandGroup(
          RapidFireCommandDefinition.NFT_TRANSFER_SUBCOMMAND_NAME,
          'Run load tests using the network load generator with the NftTransferLoadTest class',
        )
          .addSubcommand(
            new Subcommand(
              RapidFireCommandDefinition.START,
              'Start a rapid-fire NFT transfer load test using the NftTransferLoadTest class.',
              this.rapidFireCommand,
              this.rapidFireCommand.nftTransferStart,
              RapidFireCommand.START_FLAGS_LIST,
              [constants.HELM, constants.KUBECTL],
              false,
            ),
          )
          .addSubcommand(
            new Subcommand(
              RapidFireCommandDefinition.STOP,
              'Stop any running processes using the NftTransferLoadTest class.',
              this.rapidFireCommand,
              this.rapidFireCommand.nftTransferStop,
              RapidFireCommand.STOP_FLAGS_LIST,
              [constants.HELM, constants.KUBECTL],
              false,
            ),
          ),
      )
      .addCommandGroup(
        new CommandGroup(
          RapidFireCommandDefinition.TOKEN_TRANSFER_SUBCOMMAND_NAME,
          'Run load tests using the network load generator with the TokenTransferLoadTest class',
        )
          .addSubcommand(
            new Subcommand(
              RapidFireCommandDefinition.START,
              'Start a rapid-fire token transfer load test using the TokenTransferLoadTest class.',
              this.rapidFireCommand,
              this.rapidFireCommand.tokenTransferStart,
              RapidFireCommand.START_FLAGS_LIST,
              [constants.HELM, constants.KUBECTL],
              false,
            ),
          )
          .addSubcommand(
            new Subcommand(
              RapidFireCommandDefinition.STOP,
              'Stop any running processes using the TokenTransferLoadTest class.',
              this.rapidFireCommand,
              this.rapidFireCommand.tokenTransferStop,
              RapidFireCommand.STOP_FLAGS_LIST,
              [constants.HELM, constants.KUBECTL],
              false,
            ),
          ),
      )
      .addCommandGroup(
        new CommandGroup(
          RapidFireCommandDefinition.SMART_CONTRACT_SUBCOMMAND_NAME,
          'Run load tests using the network load generator with the SmartContractLoadTest class',
        )
          .addSubcommand(
            new Subcommand(
              RapidFireCommandDefinition.START,
              'Start a rapid-fire smart contract load test using the SmartContractLoadTest class.',
              this.rapidFireCommand,
              this.rapidFireCommand.smartContractStart,
              RapidFireCommand.START_FLAGS_LIST,
              [constants.HELM, constants.KUBECTL],
              false,
            ),
          )
          .addSubcommand(
            new Subcommand(
              RapidFireCommandDefinition.STOP,
              'Stop any running processes using the SmartContractLoadTest class.',
              this.rapidFireCommand,
              this.rapidFireCommand.smartContractStop,
              RapidFireCommand.STOP_FLAGS_LIST,
              [constants.HELM, constants.KUBECTL],
              false,
            ),
          ),
      )
      .addCommandGroup(
        new CommandGroup(
          RapidFireCommandDefinition.HELI_SWAP_SUBCOMMAND_NAME,
          'Run load tests using the network load generator with the HeliSwapLoadTest class',
        )
          .addSubcommand(
            new Subcommand(
              RapidFireCommandDefinition.START,
              'Start a rapid-fire HeliSwap load test using the HeliSwapLoadTest class.',
              this.rapidFireCommand,
              this.rapidFireCommand.heliSwapStart,
              RapidFireCommand.START_FLAGS_LIST,
              [constants.HELM, constants.KUBECTL],
              false,
            ),
          )
          .addSubcommand(
            new Subcommand(
              RapidFireCommandDefinition.STOP,
              'Stop any running processes using the HeliSwapLoadTest class.',
              this.rapidFireCommand,
              this.rapidFireCommand.heliSwapStop,
              RapidFireCommand.STOP_FLAGS_LIST,
              [constants.HELM, constants.KUBECTL],
              false,
            ),
          ),
      )
      .addCommandGroup(
        new CommandGroup(
          RapidFireCommandDefinition.LONGEVITY_SUBCOMMAND_NAME,
          'Run load tests using the network load generator with the LongevityLoadTest class',
        )
          .addSubcommand(
            new Subcommand(
              RapidFireCommandDefinition.START,
              'Start a rapid-fire longevity load test using the LongevityLoadTest class.',
              this.rapidFireCommand,
              this.rapidFireCommand.longevityStart,
              RapidFireCommand.START_FLAGS_LIST,
              [constants.HELM, constants.KUBECTL],
              false,
            ),
          )
          .addSubcommand(
            new Subcommand(
              RapidFireCommandDefinition.STOP,
              'Stop any running processes using the LongevityLoadTest class.',
              this.rapidFireCommand,
              this.rapidFireCommand.longevityStop,
              RapidFireCommand.STOP_FLAGS_LIST,
              [constants.HELM, constants.KUBECTL],
              false,
            ),
          ),
      )
      .addCommandGroup(
        new CommandGroup(
          RapidFireCommandDefinition.DESTROY_SUBCOMMAND_NAME,
          'Uninstall the Network Load Generator Helm chart and clean up resources.',
        ).addSubcommand(
          new Subcommand(
            RapidFireCommandDefinition.ALL,
            'Uninstall the Network Load Generator Helm chart and remove all related resources.',
            this.rapidFireCommand,
            this.rapidFireCommand.destroy,
            RapidFireCommand.STOP_FLAGS_LIST,
            [constants.HELM, constants.KUBECTL],
            false,
          ),
        ),
      )
      .build();
  }
}
