### General requirements:

- Must create and maintain unit tests for all methods.
- Unit tests must be run on all commits.
- Must create a README.md file.
- Must create a .gitignore file.
- Always create an .editorconfig file.
- Must create a /docs folder.
- Always create or update documentation in the /docs folder.

### Objectives:

### Create a visual simulation of an SCPI capable multimeter.

- Application framework: Deno.js,
- Use vendored assets and dependencies.
- Allow for both CLI and GUI applications.
- Allow for both offline and local-network only operation.

#### Create a visual simulation of a two input multimeter.

- An example to use: https://siglentna.com/digital-multimeters/sdm3045x-digital-multimeter/
- Programming references can include:
  .assets/SDM-Series-Digital-Multimeter_ProgrammingGuide_EN02A.pdf
- The meter should look like the example.
- The display should resemble the device being simulated as far is practical.
- the simulated device should emulate, as far as possible, the capabilities described in
  .assets/SDM3045X_DataSheet_E04A.pdf

### Input:

#### The simulation must be able to create and present simulated data that can be read by the SCPI interface.

- The Simulator must respond to inputs from the SCPI interface in a manner consistent with the
  device being simulated.

#### User input:

- This simulation must respond to user input.

#### SCPI interface:

- The Simulator must respond to reqyests from the SCPI interface in a manner consistent with the
  device being simulated.
- The simulation must be able to report SCPI status.
- The simulation must be able to report SCPI errors.
- The simulation must be able to report SCPI measurements.
