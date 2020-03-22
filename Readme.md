# sigma-air-manager-exporter - a Prometheus exporter for KAESER CONNECT – SIGMA AIR MANAGER 4.0

More information on those devices can be found here: https://us.kaeser.com/

The sigma-air-manager-exporter Prometheus exporter is a straight forward approach to provide the data in neat Gauge values.

Please feel free to provide input or issues to this project. 

## Prerequisites
In order to run sigma-air-manager-exporter you need Node.js installed on your system.

## Installation
The Installation is simple as can be. 
```
npm i
```

## Configuration
The configuration of your Air Manager will be asked upon installation. You can change the configuration everythime by 
```
npm run configure
``` 

## Running
To start the server run. 

```
node path/to/sigma-air-manager-exporter
```

or

```
npx path/to/sigma-air-manager-exporter
```

(You might want to run this as a service)

## Getting the values
The exporter provides the values per installed digital current meter as follows

```
http://{YourExporterServer}:9693/values

e.g. http://localhost:9693/values

Raw JSON Data like so: http://{YourExporterServer}:9693/valuesJson
```

## Availabe Values (WIP)

| Value                                 | Description                               | Unit      |
| :-------------                        |:-------------                             |:-----     |
| sigma_airman_sysmon_temp_cpu          | CPU temperature of SAM 4.0 terminal       | Kelvin    |
| sigma_airman_sysmon_temp_board        | Board temperature of SAM 4.0 terminal     | Kelvin    |
| sigma_airman_sysmon_temp_display      | Display temperature of SAM 4.0 terminal   | Kelvin    |
| sigma_airman_sysmon_voltage           | Supply voltage of SAM 4.0 terminal        | Volt      |
| sigma_airman_current_net_pressure     | Current network pressure                  | Pascal    |
| sigma_airman_consumption              | Compressed air consumption                | m³/s      |
| sigma_airman_fad                      | Volumetric flow rate (FAD)                | m³/s      |
