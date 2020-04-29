export declare function getMicrosecondsTime(): number;
export declare function getDurationInMicroSeconds(before: number): number;
export declare const showExecutionTimes: () => void;
export declare const MonitorExecutionTime: (idProperty?: string) => (target: any, propertyKey: string, descriptor: PropertyDescriptor) => void;
