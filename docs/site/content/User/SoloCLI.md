## Solo command line user manual

Solo has a series of commands to use, and some commands have subcommands.
User can get help information by running with the following methods:

`solo --help` will return the help information for the `solo` command to show which commands
are available.

`solo command --help` will return the help information for the specific command to show which options

```text
solo account --help

Manage Hedera accounts in solo network

Commands:
  account init     Initialize system accounts with new keys
  account create   Creates a new account with a new key and stores the key in th
                   e Kubernetes secrets, if you supply no key one will be genera
                   ted for you, otherwise you may supply either a ECDSA or ED255
                   19 private key
  account update   Updates an existing account with the provided info, if you wa
                   nt to update the private key, you can supply either ECDSA or
                   ED25519 but not both

  account get      Gets the account info including the current amount of HBAR

Options:
      --dev                 Enable developer mode                      [boolean]
      --force-port-forward  Force port forward to access the network services
                                                                       [boolean]
  -h, --help                Show help                                  [boolean]
  -v, --version             Show version number                        [boolean]
```

`solo command subcommand --help` will return the help information for the specific subcommand to show which options

```text
solo account create --help

Creates a new account with a new key and stores the key in the Kubernetes secret
s, if you supply no key one will be generated for you, otherwise you may supply
either a ECDSA or ED25519 private key

Options:
      --dev                  Enable developer mode                     [boolean]
      --force-port-forward   Force port forward to access the network services
                                                                       [boolean]
      --hbar-amount          Amount of HBAR to add                      [number]
      --create-amount        Amount of new account to create            [number]
      --ecdsa-private-key    ECDSA private key for the Hedera account   [string]
  -d, --deployment           The name the user will reference locally to link to
                              a deployment                              [string]
      --ed25519-private-key  ED25519 private key for the Hedera account [string]
      --generate-ecdsa-key   Generate ECDSA private key for the Hedera account
                                                                       [boolean]
      --set-alias            Sets the alias for the Hedera account when it is cr
                             eated, requires --ecdsa-private-key       [boolean]
  -c, --cluster-ref          The cluster reference that will be used for referen
                             cing the Kubernetes cluster and stored in the local
                              and remote configuration for the deployment.  For
                             commands that take multiple clusters they can be se
                             parated by commas.                         [string]
  -h, --help                 Show help                                 [boolean]
  -v, --version              Show version number                       [boolean]
```

## For more information see: [SoloCommands.md](SoloCommands.md)

```
```
