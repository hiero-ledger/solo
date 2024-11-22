/**
 * Copyright (C) 2024 Hedera Hashgraph, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the ""License"");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an ""AS IS"" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */
import { LocalConfig } from '../../../src/core/config/local_config.js'
import fs from 'fs'
import { stringify } from 'yaml'
import { expect } from 'chai'
import { MissingArgumentError, SoloError } from '../../../src/core/errors.js'
import { getTestCacheDir, testLogger } from '../../test_util.js'

describe('LocalConfig', () => {
    let localConfig
    const filePath = `${getTestCacheDir('LocalConfig')}/localConfig.yaml`
    const config = {
        userEmailAddress: 'john.doe@example.com',
        deployments: {
            'my-deployment': {
                clusterAliases: ['cluster-1', 'context-1'],
            },
            'my-other-deployment': {
                clusterAliases: ['cluster-2', 'context-2'],
            }
        },
        currentDeploymentName: 'my-deployment'
    }


    const expectFailedValidation = () => {
        try {
            new LocalConfig(filePath, testLogger)
            expect.fail('Expected an error to be thrown')
        }
        catch(error) {
            expect(error).to.be.instanceOf(SoloError)
            expect(error.message).to.equal('Validation of local config failed')
        }
    }

    beforeEach(async () => {
        await fs.promises.writeFile(filePath, stringify(config))
        localConfig = new LocalConfig(filePath, testLogger)
    })

    afterEach(async () => {
        await fs.promises.unlink(filePath)
    })

    it('should load config from file', async () => {
        expect(localConfig.userEmailAddress).to.eq(config.userEmailAddress)
        expect(localConfig.deployments).to.deep.eq(config.deployments)
        expect(localConfig.currentDeploymentName).to.eq(config.currentDeploymentName)
    })

    it('should set user email address', async () => {
        const newEmailAddress = 'jane.doe@example.com'
        localConfig.setUserEmailAddress(newEmailAddress)
        expect(localConfig.userEmailAddress).to.eq(newEmailAddress)

        await localConfig.write()

        // reinitialize with updated config file
        const newConfig = new LocalConfig(filePath, testLogger)
        expect(newConfig.userEmailAddress).to.eq(newEmailAddress)
    })

    it('should not set an invalid email as user email address', async () => {
        try {
            localConfig.setUserEmailAddress('invalidEmail')
            expect.fail('expected an error to be thrown')
        } catch (error) {
            expect(error).to.be.instanceOf(SoloError)
        }
    })

    it('should set deployments', async () => {
        const newDeployments = {
            'my-deployment': {
                clusterAliases: ['cluster-1', 'context-1'],
            },
            'my-new-deployment': {
                clusterAliases: ['cluster-3', 'context-3'],
            }
        }

        localConfig.setDeployments(newDeployments)
        expect(localConfig.deployments).to.deep.eq(newDeployments)

        await localConfig.write()
        const newConfig = new LocalConfig(filePath, testLogger)
        expect(newConfig.deployments).to.deep.eq(newDeployments)
    })

    it('should not set invalid deployments', async () => {
        const validDeployment = { clusterAliases: ['cluster-3', 'cluster-4'] }
        const invalidDeployments = [
            { foo: ['bar'] },
            { clusterAliases: [5, 6, 7] },
            { clusterAliases: 'bar' },
            { clusterAliases: 5 },
            { clusterAliases: { foo: 'bar '} }
        ]

        for ( const invalidDeployment of invalidDeployments ) {
            const deployments = {
                'valid-deployment': validDeployment,
                'invalid-deployment': invalidDeployment
            }

            try {
                localConfig.setDeployments(deployments)
                expect.fail('expected an error to be thrown')
            } catch (error) {
                expect(error).to.be.instanceOf(SoloError)
            }
        }
    })

    it('should not set invalid context mappings', async () => {
        const invalidContextMappings = {
            'cluster-3': 'context-3',
            'invalid-cluster': 5,
        }

        try {
            localConfig.setContextMappings(invalidContextMappings)
            expect.fail('expected an error to be thrown')
        } catch (error) {
            expect(error).to.be.instanceOf(TypeError)
        }
    })

    it('should get current deployment', async () => {
        expect(localConfig.getCurrentDeployment()).to.deep.eq(config.deployments[config.currentDeploymentName])
    })

    it('should set current deployment', async () => {
        const newCurrentDeployment = 'my-other-deployment'
        localConfig.setCurrentDeployment(newCurrentDeployment)

        expect(localConfig.currentDeploymentName).to.eq(newCurrentDeployment)

        await localConfig.write()
        const newConfig = new LocalConfig(filePath, testLogger)
        expect(newConfig.currentDeploymentName).to.eq(newCurrentDeployment)
    })

    it('should not set invalid or non-existent current deployment', async () => {
        const invalidCurrentDeploymentName = 5
        try {
            localConfig.setCurrentDeployment(invalidCurrentDeploymentName)
            expect.fail('expected an error to be thrown')
        } catch (error) {
            expect(error).to.be.instanceOf(SoloError)
        }

        const nonExistentCurrentDeploymentName = 'non-existent-deployment'
        try {
            localConfig.setCurrentDeployment(nonExistentCurrentDeploymentName)
            expect.fail('expected an error to be thrown')
        } catch (error) {
            expect(error).to.be.instanceOf(SoloError)
        }
    })

    it('should throw an error if file path is not set', async () => {
        try {
            new LocalConfig('', testLogger)
            expect.fail('Expected an error to be thrown')
        } catch (error) {
            expect(error).to.be.instanceOf(MissingArgumentError)
            expect(error.message).to.equal('a valid filePath is required')
        }
    })

    it('should throw a validation error if the config file is not a valid LocalConfig', async () => {
        // without any known properties
        await fs.promises.writeFile(filePath, 'foo: bar')
        expectFailedValidation()

        // with extra property
        await fs.promises.writeFile(filePath, stringify({ ...config, foo: 'bar' }))
        expectFailedValidation()
    })

    it('should throw a validation error if userEmailAddress is not a valid email', async () => {
        await fs.promises.writeFile(filePath, stringify({ ...config, userEmailAddress: 'foo' }))
        expectFailedValidation()

        await fs.promises.writeFile(filePath, stringify({ ...config, userEmailAddress: 5 }))
        expectFailedValidation()
    })

    it('should throw a validation error if deployments format is not correct', async () => {
        await fs.promises.writeFile(filePath, stringify({ ...config, deployments: 'foo' }))
        expectFailedValidation()

        await fs.promises.writeFile(filePath, stringify({ ...config, deployments: { 'foo': 'bar' } }))
        expectFailedValidation()

        await fs.promises.writeFile(filePath, stringify({
                ...config,
                deployments: [{ 'foo': 'bar' }]
            })
        )
        expectFailedValidation()
    })

    it('should throw a validation error if currentDeploymentName format is not correct', async () => {
        await fs.promises.writeFile(filePath, stringify({ ...config, currentDeploymentName: 5 }))
        expectFailedValidation()

        await fs.promises.writeFile(filePath, stringify({ ...config, currentDeploymentName: ['foo', 'bar'] }))
        expectFailedValidation()
    })
})