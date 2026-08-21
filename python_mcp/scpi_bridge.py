import sys
import json
import pyvisa

def main():
    rm = pyvisa.ResourceManager()
    
    for line in sys.stdin:
        try:
            request = json.loads(line)
            cmd = request.get("command")
            
            if cmd == "list_resources":
                resources = rm.list_resources()
                print(json.dumps({"status": "success", "resources": resources}))
            
            elif cmd == "query":
                resource_name = request.get("resource")
                query_str = request.get("query")
                try:
                    inst = rm.open_resource(resource_name)
                    response = inst.query(query_str)
                    print(json.dumps({"status": "success", "response": response.strip()}))
                    inst.close()
                except Exception as e:
                    print(json.dumps({"status": "error", "message": str(e)}))
            
            elif cmd == "write":
                resource_name = request.get("resource")
                write_str = request.get("write")
                try:
                    inst = rm.open_resource(resource_name)
                    inst.write(write_str)
                    print(json.dumps({"status": "success"}))
                    inst.close()
                except Exception as e:
                    print(json.dumps({"status": "error", "message": str(e)}))
            
            else:
                print(json.dumps({"status": "error", "message": "Unknown command"}))
        except Exception as e:
            print(json.dumps({"status": "error", "message": str(e)}))
        sys.stdout.flush()

if __name__ == "__main__":
    main()
