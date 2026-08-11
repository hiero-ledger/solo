// Copyright (C) 2022-2024 Hedera Hashgraph, LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// eslint-disable-next-line n/no-unsupported-features/node-builtins
import {isSea} from 'node:sea';

console.log('Hello from Solo SEA!');
console.log(`Running as Single Executable Application: ${isSea()}`);
console.log(`Node.js ${process.version} on ${process.platform}/${process.arch}`);
