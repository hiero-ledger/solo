### Local Test

* Alwasys clean up before tese `for cluster in $(kind get clusters);do kind delete cluster -n $cluster;done; rm -rf ~/.solo/*; rm -rf test/data/tmp/*;`
* Run local E2E test: `task test-setup; task <test_script_name>`
* Run lcoal example test: `cd <<example_directory_name>; task`

### Github Test

Run example test with command `gh workflow run "Test Examples" -r <branch_name> -f example-directory=<example_directory_name>`
Run E2E test with command `gh workflow run "ZXC: E2E Test" -r <branch_name> -f test-script=<test_script_name>`, test\_script\_name> can be found in .github/workflows/support/e2e-test-matrix.json
After kicking off test with gh, monitor process if failed try to fix and kick off again

### Repo

Create PR using template .github/pull\_request\_template.md
Create bug issue using template  .github/ISSUE\_TEMPLATE/bug\_report.yml
Create a feature issue using template. github/ISSUE\_TEMPLATE/feature\_request.yml

### commit

run `task build` and `task format` before push any commit to PR
