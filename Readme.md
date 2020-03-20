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
http://{YourExporterServer}:969x/values

e.g. http://localhost:969x/values
```
