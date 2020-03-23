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
The exporter provides the values as follows

```
http://{YourExporterServer}:9693/values

e.g. http://localhost:9693/values

Raw JSON Data like so: http://{YourExporterServer}:9693/valuesJson
```

## Availabe Values (WIP)

| Value                                 | Description                               | Unit              |
| :-------------                        |:-------------                             |:-----             |
| sigma_airman_is_alive_info                     | Checks the timestamp of the last websocket communication. Will render 0 if last message is older than 1 minute.       | Boolean 0 or 1    |
| sigma_airman_is_sync_info                     | Checks the timestamp of the last sysmon message. Will render 0 if timestamp is older or newer than 1 minute. You might want to check the Date/Time settings on server and terminal. | Boolean 0 or 1    |
| sigma_airman_sysmon_has_iot_net_conflict_info | Has Iot Network Conflict               | Boolean 0 or 1    |
| sigma_airman_sysmon_temp_cpu_celsius          | CPU temperature of SAM 4.0 terminal       | Celcius            |
| sigma_airman_sysmon_temp_board_celsius        | Board temperature of SAM 4.0 terminal     | Celcius            |
| sigma_airman_sysmon_temp_display_celsius      | Display temperature of SAM 4.0 terminal   | Celcius            |
| sigma_airman_sysmon_terminal_power_volts     | Supply voltage of SAM 4.0 terminal        | Volts              |
| sigma_airman_current_net_pressure_pascal     | Current network pressure                  | Pascal            |
| sigma_airman_consumption_cubicmetersperhour  | Compressed air consumption                | m³/h              |
| sigma_airman_fad_cubicmetersperhour          | Volumetric flow rate (FAD)                | m³/h              |
| sigma_airman_compressor_rpm{compressor=COMPRESSORNAME} | RPM of compressor motor                | RPM             |
| sigma_airman_compressor_maintenance_timer_seconds{compressor=COMPRESSORNAME} | Time to next maintenance    | Seconds             |
| sigma_airman_compressor_power_watts{compressor=COMPRESSORNAME} | Power consumption of cmpressor   | Watts             |
