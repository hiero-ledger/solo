# Instructions for developers working on solo project

Below we describe how you can set up a local environment and contribute to `solo`.

* Clone the repo
* In order to support ES6 modules with `jest`, set an env variable `NODE_OPTIONS` as below:
  * `export NODE_OPTIONS=--experimental-vm-modules >> ~/.zshrc`
* For Intellij users: enable `--experimental-vm-modules` for `Jest` as below:
  * Go to: `Run->Edit Configurations->Edit Configuration Templates->Jest`
  * Set: `--experimental-vm-modules` in `Node Options`.
* Run `npm i` to install the required packages
* Run `npm link` to install `solo` as the CLI
  * Note: you need to do it once. If `solo` already exists in your path, you will need to remove it first.
  * Alternative way would be to run `npm run solo-test -- <COMMAND> <ARGS>`
* Run `task test` to run the unit tests
* Run `solo` to access the CLI.
* Note that debug logs are stored at `$HOME/.solo/logs/solo.log`.
  * So you may use `tail -f $HOME/.solo/logs/solo.log | jq` in a separate terminal to keep an eye on the logs.
* Before making a commit run `task format`

## E2E tests

* In order to run E2E test, we need to set up a cluster and install the chart.
  * Run `task test-setup`
  * Run `task test-e2e-standard`, NOTE: this excludes some E2E tests that have their own command
  * You can check the command `task --list-all` for more other test commands available.
