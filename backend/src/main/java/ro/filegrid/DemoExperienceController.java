package ro.filegrid;

import java.io.IOException;
import java.util.Map;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1")
class DemoExperienceController {
  private final DemoExperience experience;
  DemoExperienceController(DemoExperience experience){this.experience=experience;}
  @GetMapping("/simulator")
  Object simulator(Authentication actor){FileService.roles(actor,"METER_INGEST","DISPATCHER");return experience.simulator();}
  @PutMapping("/demo/volume")
  Object volume(@RequestBody Map<String,Object> body,Authentication actor){return experience.volume(body.get("multiplier"),actor);}
  @PostMapping("/demo/notifications/test")
  Object notification(Authentication actor){return experience.notifyTest(actor);}
  @PostMapping("/demo/integrity-probes")
  Object integrity(Authentication actor)throws IOException{return experience.integrity(actor);}
}
